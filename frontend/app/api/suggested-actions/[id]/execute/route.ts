import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { executeToolCall } from '@/lib/tools/execute-tool-call'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

// POST /api/suggested-actions/[id]/execute
// Body: { inputs?: Record<string, string> }  — user-supplied required_inputs (e.g. destination_email)
//
// Execution contract per Spec §6.1 §15.7:
//   suggested → tapped → (needs_input?) → executing → completed | failed | approved (if HITL)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Must use the SSR cookie client for auth — the service-role client has no
  // session cookie context and auth.getUser() always returns null on it.
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Service-role client for all subsequent DB writes (bypasses RLS; ownership
  // is verified explicitly via .eq('created_by', userId) on every query).
  const supabase = createServerSupabaseClient()

  const userId = user.id
  const actionId = params.id
  let inputs: Record<string, string> = {}
  let body: Record<string, unknown> = {}

  try {
    body = await req.json()
    inputs = (body.inputs as Record<string, string> | undefined) || {}
  } catch { /* body is optional */ }

  // Load the SuggestedAction — must belong to this user
  const { data: action, error: actionErr } = await supabase
    .from('suggested_actions')
    .select('*')
    .eq('id', actionId)
    .eq('created_by', userId)
    .single()

  if (actionErr || !action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 })
  }

  if (!['suggested', 'tapped'].includes(action.status)) {
    return NextResponse.json({ error: `Action already in terminal state: ${action.status}` }, { status: 409 })
  }

  const idempotency = await beginIdempotentRequest(req, supabase, userId, body)
  if (idempotency.kind === 'response') return idempotency.response

  // Mark tapped immediately so double-clicks are idempotent
  await supabase.from('suggested_actions').update({ status: 'tapped' }).eq('id', actionId)

  // Check required_inputs — if any are missing, return prompt
  const requiredInputs: string[] = action.required_inputs || []
  const missingInputs = requiredInputs.filter((field: string) => !inputs[field])
  if (missingInputs.length > 0) {
    const responseBody = { needs_input: true, fields: missingInputs }
    await completeIdempotentRequest(req, supabase, userId, responseBody, 200)
    return NextResponse.json(responseBody)
  }

  const { action_slug, payload = {} } = action
  const merged = { ...payload, ...inputs }

  try {
    let result: Record<string, unknown>

    switch (action_slug) {
      // ── send_to_email ───────────────────────────────────────────────────────
      case 'send_to_email': {
        // Resolve goal_id from payload or artifact; fall back to null (never use
        // the action ID as a fake goal_id — that produces phantom goal rows).
        let goalId: string | null = (merged.goal_id as string) || null
        if (!goalId && merged.artifact_id) {
          const { data: art } = await supabase
            .from('artifacts')
            .select('goal_id')
            .eq('id', merged.artifact_id as string)
            .single()
          if (art?.goal_id) goalId = art.goal_id
        }

        result = await executeToolCall({
          userId,
          departmentId: 'executive',
          taskId: (merged.artifact_id as string) || actionId,
          goalId,
          toolCall: {
            service: 'gmail',
            action: 'send_email',
            params: {
              to: merged.destination_email,
              subject: merged.subject || `File from Crost: ${merged.file_name || 'Attachment'}`,
              body: 'Hi,\n\nPlease find the attached file from your Crost workspace.\n\nBest,\nYour Crost Assistant',
              attachment_url: merged.file_url,
              attachment_name: merged.file_name,
            },
            reasoning: `Founder requested to send "${merged.file_name || 'artifact'}" to ${merged.destination_email}`,
            risk: 'medium',
            requiresApproval: false,
          }
        }) as Record<string, unknown>
        break
      }

      // ── save_to_kb ──────────────────────────────────────────────────────────
      case 'save_to_kb': {
        const artifactId = merged.artifact_id as string
        if (!artifactId) {
          result = { error: 'Missing artifact_id in payload' }
          break
        }

        const { data: artifact } = await supabase
          .from('artifacts')
          .select('title, file_url, artifact_type')
          .eq('id', artifactId)
          .single()

        if (!artifact?.file_url) {
          result = { error: 'Artifact not found or has no file_url' }
          break
        }

        const mimeMap: Record<string, string> = {
          presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          document: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          spreadsheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          pdf: 'application/pdf',
          image: 'image/png',
          data: 'application/json',
          code: 'text/plain',
        }

        const { error: kbErr } = await supabase.from('knowledge_base_files').insert({
          created_by: userId,
          title: artifact.title || (merged.title as string) || 'Artifact from Crost',
          file_name: artifact.file_url.split('/').pop() || 'artifact',
          file_type: artifact.artifact_type || 'document',
          mime_type: mimeMap[artifact.artifact_type] || 'application/octet-stream',
          file_url: artifact.file_url,
          storage_path: artifact.file_url,
          category: 'product',
          tags: ['from_crost', 'artifact', artifact.artifact_type].filter(Boolean),
          upload_status: 'uploaded',
          processing_status: 'completed',
          extracted_summary: `Artifact generated by Crost. Type: ${artifact.artifact_type || 'unknown'}.`,
          file_size: 0,
        })

        result = kbErr
          ? { error: kbErr.message }
          : { success: true, message: 'Saved to Knowledge Base' }
        break
      }

      // ── add_to_memo ─────────────────────────────────────────────────────────
      case 'add_to_memo': {
        const title = (merged.title as string) || 'Decision from mission output'
        const content = (merged.content as string) || 'Key output saved as a decision in the Memo.'

        const { error: memoErr } = await supabase.from('company_memos').insert({
          from_department: 'orc',
          goal_id: (merged.goal_id as string) || null,
          title: `[Decision] ${title}`,
          body: content,
          tags: ['decision', 'from_suggested_action'],
          priority: 'normal',
          created_by: userId,
        })

        result = memoErr
          ? { error: memoErr.message }
          : { success: true, message: 'Saved to Memo' }
        break
      }

      // ── make_changes ────────────────────────────────────────────────────────
      // UI-only: redirect the founder back to War Room with context pre-loaded
      case 'make_changes': {
        result = {
          redirect: true,
          goal_id: merged.goal_id || null,
          artifact_id: merged.artifact_id || null,
        }
        break
      }

      default: {
        result = { error: `Action slug "${action_slug}" is not yet implemented` }
      }
    }

    // Thread outcome back into the SuggestedAction row
    if (result.error) {
      await supabase.from('suggested_actions')
        .update({ status: 'failed' })
        .eq('id', actionId)
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Tool not connected — surface clearly rather than marking completed
    if ((result as any).status === 'missing_connection') {
      await supabase.from('suggested_actions')
        .update({ status: 'failed' })
        .eq('id', actionId)
      return NextResponse.json({
        error: (result as any).message || 'Tool not connected',
        missing_connection: true,
        service: (result as any).service,
      }, { status: 409 })
    }

    if ((result as any).status === 'permission_denied') {
      await supabase.from('suggested_actions')
        .update({ status: 'failed' })
        .eq('id', actionId)
      return NextResponse.json({ error: (result as any).message }, { status: 403 })
    }

    if ((result as any).status === 'requires_approval') {
      await supabase.from('suggested_actions')
        .update({ status: 'approved', approval_id: (result as any).execution_id || null })
        .eq('id', actionId)
      const responseBody = {
        requires_approval: true,
        approval_id: (result as any).execution_id,
        message: (result as any).message,
      }
      await completeIdempotentRequest(req, supabase, userId, responseBody, 200)
      return NextResponse.json(responseBody)
    }

    if (result.redirect) {
      const responseBody = { redirect: true, goal_id: result.goal_id, artifact_id: result.artifact_id }
      await completeIdempotentRequest(req, supabase, userId, responseBody, 200)
      return NextResponse.json(responseBody)
    }

    // Success
    await supabase.from('suggested_actions')
      .update({ status: 'completed', resolved_at: new Date().toISOString() })
      .eq('id', actionId)

    const responseBody = { success: true, result }
    await completeIdempotentRequest(req, supabase, userId, responseBody, 200)
    return NextResponse.json(responseBody)

  } catch (err: any) {
    await supabase.from('suggested_actions').update({ status: 'failed' }).eq('id', actionId)
    console.error('[SuggestedAction Execute]', err)
    return NextResponse.json({ error: err.message || 'Execution failed' }, { status: 500 })
  }
}
