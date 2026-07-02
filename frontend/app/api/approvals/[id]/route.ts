import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { cleanLargePayload, normalizeToolName } from "@/lib/utils"
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

interface Params { params: { id: string } }

const DecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decided_by: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(_req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', params.id)
      .or(`created_by.eq.${user.id},user_id.eq.${user.id}`)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const body = await req.json()
    const { decision, decided_by } = DecisionSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // 1. Fetch by ID only to see if the record exists at all (Service Role bypasses RLS)
    const { data: approval, error: fetchErr } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', params.id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!approval) {
      console.error(`[PATCH /api/approvals] Record ${params.id} not found in DB.`)
      return NextResponse.json({ error: 'Approval not found in database' }, { status: 404 })
    }

    // 2. Manual ownership check for debugging
    const isOwner = approval.user_id === user.id || approval.created_by === user.id
    if (!isOwner) {
      console.error(`[PATCH /api/approvals] Ownership mismatch. Record owner: ${approval.user_id || approval.created_by}, Requestor: ${user.id}`)
      return NextResponse.json({ error: 'You do not have permission to decide on this approval' }, { status: 403 })
    }

    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot decide on approval with status "${approval.status}"` },
        { status: 409 }
      )
    }

    // 3. Update approval status
    const { data: updated, error: updateErr } = await supabase
      .from('approval_queue')
      .update({ status: decision, decided_at: new Date().toISOString(), decided_by })
      .eq('id', params.id)
      .select()
      .single()

    if (updateErr) throw updateErr

    // Phase 5 fix (spec §6.1 execution contract): resolve any SuggestedAction
    // linked to this approval (suggested_actions.approval_id -> approval_queue.id)
    // now that the founder has actually decided. Previously the linked
    // suggested_action's status was set to 'approved' the moment the approval
    // row was merely QUEUED (in the [id]/execute route, at tap time) — this is
    // the actual founder confirmation the spec requires before that status is
    // legitimate. Guarded on status='tapped' so this is a no-op if there's no
    // linked suggested_action, or it was already resolved by something else.
    await supabase
      .from('suggested_actions')
      .update({
        status: decision === 'approved' ? 'approved' : 'failed',
        resolved_at: decision === 'rejected' ? new Date().toISOString() : null,
      })
      .eq('approval_id', params.id)
      .eq('status', 'tapped')

    // Reset department status to idle
    await supabase
      .from('departments')
      .update({ status: 'idle' })
      .eq('id', approval.department_id)
      .eq('created_by', user.id)

    // If rejected, mark the associated goal task as rejected so the chain can continue.
    if (decision === 'rejected') {
      const taskId = (approval.payload as any)?.__task_id
      if (taskId && approval.goal_id) {
        await supabase.from('goal_tasks').update({
          status: 'rejected',
          completed_at: new Date().toISOString()
        }).eq('goal_id', approval.goal_id).eq('task_id', taskId)

        // Trigger chain reaction so downstream tasks that only needed this one to terminal can proceed.
        fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/goals/${approval.goal_id}/dispatch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-crost-internal-secret': process.env.WORKER_INTERNAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
          },
          body: JSON.stringify({ task_id: 'CHAIN_REACTION' })
        }).catch(e => console.error('[Approval Rejection] Chain reaction failed:', e))
      }
    }

    // Log decision
    await supabase.from('event_log').insert({
      department_id: approval.department_id,
      department_slug: approval.department_slug,
      goal_id: approval.goal_id,
      event_type: decision === 'approved' ? 'approval_approved' : 'approval_rejected',
      description: `Approval ${decision}: ${approval.action_label}`,
      metadata: { approval_id: params.id, decided_by },
      created_by: user.id
    })

    // ─── AGENT EXECUTION LOOP ────────────────────────────────────────────────
    // If approved, execute the tool call.
    let executionError: string | null = null
    let executionFinalStatus: 'executed' | 'failed' | null = null
    if (decision === 'approved') {
      // When action_type was normalised to 'tool_call' during enqueue, the real
      // action name is stashed in payload.__tool_action.
      const rawAction: string | null =
        (approval.payload as any)?.__tool_action
        ?? (approval.action_type !== 'tool_call' ? approval.action_type : null)
      const composioActionForCall = normalizeToolName(rawAction ?? approval.action_type)
      const normalizedAction = composioActionForCall.toLowerCase()

      const isExternalAction = normalizedAction.startsWith('gmail_') ||
        normalizedAction.startsWith('googlecalendar_') ||
        normalizedAction.startsWith('googlesheets_') ||
        normalizedAction.startsWith('googledrive_') ||
        normalizedAction.startsWith('slack_') ||
        normalizedAction.startsWith('github_') ||
        normalizedAction.startsWith('notion_') ||
        normalizedAction.startsWith('linear_') ||
        (composioActionForCall.includes('_') && composioActionForCall === composioActionForCall.toUpperCase())

      const isInternalTool = ['supabase_query', 'company_memos', 'save_document', 'get_sales_data'].includes(normalizedAction)

      if (isExternalAction || isInternalTool) {
        try {
          let result: any;

          if (isExternalAction) {
            const normalizedActionUpper = composioActionForCall.toUpperCase()
            // Native Gmail send via the user's Google OAuth token (no broker).
            if (normalizedAction.startsWith('gmail_') && normalizedAction.includes('send')) {
              const { getGoogleToken } = await import('@/lib/google/auth')
              const { sendGmail } = await import('@/lib/google/gmail')
              const { accessToken, expired, connected } = await getGoogleToken(supabase, user.id)
              if (!connected || !accessToken) {
                throw new Error('Google account not connected — sign in with Google (granting Gmail access) to send email.')
              }
              if (expired) {
                throw new Error('Google session expired — reconnect your Google account to send email.')
              }
              const p = (approval.payload ?? {}) as Record<string, any>
              const sent = await sendGmail({
                accessToken,
                to: p.to ?? p.recipient ?? p.recipient_email ?? p.email ?? '',
                subject: p.subject ?? p.title ?? '',
                body: p.body ?? p.message ?? p.content ?? p.text ?? '',
                cc: p.cc,
                bcc: p.bcc,
                html: !!p.html,
              })
              console.log(`[Approval Execution] Gmail sent (${sent.id}) for user ${user.id}`)
              result = {
                success: true,
                action: normalizedActionUpper,
                status: 'sent',
                message_id: sent.id,
                thread_id: sent.threadId,
                message: `Email sent to ${p.to ?? 'recipient'}.`,
              }
            } else {
              // Other external actions (Calendar, non-Google) not yet wired natively.
              console.log(`[Approval Execution] Recording external action "${normalizedActionUpper}" for user ${user.id}`)
              result = {
                success: true,
                action: normalizedActionUpper,
                status: 'queued',
                message: `Action "${approval.action_label}" recorded. Native execution for this tool is coming soon.`,
              }
            }
          } else {
            console.log(`[Approval Execution] Executing Internal tool "${approval.action_type}" for user ${user.id}`)
            // Call our own internal tool execution endpoint
            const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/tools/execute`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Cookie': req.headers.get('cookie') || '' // Forward auth cookies
              },
              body: JSON.stringify({
                tool: normalizedAction,
                params: approval.payload,
                goal_id: approval.goal_id,
                department_slug: approval.department_slug,
                department_id: approval.department_id
              })
            })
            if (!res.ok) throw new Error(`Internal tool execution failed: ${await res.text()}`)
            const json = await res.json()
            result = json.data
          }
          
          // Persist result
          let bodyText = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          if (bodyText.length > 3000) bodyText = bodyText.substring(0, 3000) + '... [Truncated]'

          await supabase.from('company_memos').insert({
            from_department: approval.department_slug,
            goal_id: approval.goal_id,
            title: `Execution Result: ${approval.action_label}`,
            body: bodyText,
            tags: ['execution_result', `approval_${params.id}`, normalizedAction],
            source_type: 'agent',
            created_by: user.id
          })

          await supabase.from('approval_queue').update({
            status: 'executed',
            execution_result: result as any
          }).eq('id', params.id)
          executionFinalStatus = 'executed'

          // Mark the linked suggested_action chip as completed so the UI can
          // transition. Phase 5 fix: this previously queried
          // .eq('approval_id', approval.tool_execution_id) — tool_execution_id
          // is an unrelated column on approval_queue; suggested_actions.approval_id
          // actually references approval_queue.id (params.id), so this never
          // matched a real row. It also unconditionally required
          // approval.tool_execution_id to be truthy, which most suggested-action
          // approvals never populate.
          await supabase.from('suggested_actions')
            .update({ status: 'completed', resolved_at: new Date().toISOString() })
            .eq('approval_id', params.id)
            .neq('status', 'completed')

          // Note: event_type 'tool_executed' is whitelisted in event_log CHECK constraint
          const { error: logErr } = await supabase.from('event_log').insert({
            department_slug: approval.department_slug,
            goal_id: approval.goal_id,
            event_type: 'tool_executed',
            description: `Executed approved action: ${approval.action_label}`,
            metadata: { result: cleanLargePayload(result), tool: normalizedAction },
            created_by: user.id
          })
          if (logErr) console.error('[Approval Execution] event_log insert failed', logErr.message)

          // ─── TASK COMPLETION & CHAIN REACTION ──────────────────────────────
          // If the approval was tied to a specific task, mark it completed.
          const taskId = (approval.payload as any)?.__task_id
          if (taskId && approval.goal_id) {
            console.log(`[Approval Execution] Completing parent task ${taskId} for goal ${approval.goal_id}`)
            await supabase.from('goal_tasks').update({
              status: 'completed',
              completed_at: new Date().toISOString()
            }).eq('goal_id', approval.goal_id).eq('task_id', taskId)

            // Trigger chain reaction dispatch for downstream tasks
            // We use a relative path or the configured APP_URL
            const dispatchUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/goals/${approval.goal_id}/dispatch`
            fetch(dispatchUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-crost-internal-secret': process.env.WORKER_INTERNAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
              },
              body: JSON.stringify({ task_id: 'CHAIN_REACTION' })
            }).catch(e => console.error('[Approval Execution] Chain reaction failed:', e))
          }

          // RESET DEPARTMENT STATUS (Spec §11)
          if (approval.department_id) {
            await supabase.from('departments').update({ 
              status: 'idle', 
              current_task: null 
            }).eq('id', approval.department_id)
          }

          // Synthetic single-dept goals (from /api/departments/[slug]/task) have
          // no goal_tasks rows — the chain-reaction flow won't fire runOrcReport
          // for them. Detect that case and synthesize the Mission Report inline.
          if (approval.goal_id) {
            const { count: taskCount } = await supabase
              .from('goal_tasks')
              .select('id', { count: 'exact', head: true })
              .eq('goal_id', approval.goal_id)
            if (!taskCount || taskCount === 0) {
              const { runOrcReport } = await import('@/lib/llm-client')
              runOrcReport(approval.goal_id)
                .then(async () => {
                  await supabase.from('goals').update({ status: 'completed' }).eq('id', approval.goal_id)
                })
                .catch(e => console.error('[Approval Execution] runOrcReport failed:', e))
            }
          }
          
        } catch (execErr: any) {
          console.error(`[Approval Execution Failure]`, execErr)
          executionError = execErr?.message ?? 'Unknown execution failure'
          executionFinalStatus = 'failed'

          // RESET DEPARTMENT STATUS ON FAILURE
          if (approval.department_id) {
            await supabase.from('departments').update({ 
              status: 'error', 
              current_task: null 
            }).eq('id', approval.department_id)
          }

          await supabase.from('approval_queue').update({
            status: 'failed',
            execution_result: { error: executionError }
          }).eq('id', params.id)

          // Phase 5 fix: same wrong-column bug as the success path above —
          // approval_id, not tool_execution_id.
          await supabase.from('suggested_actions')
            .update({ status: 'failed' })
            .eq('approval_id', params.id)
            .neq('status', 'completed')

          // Mark the associated goal task as failed so it doesn't stay stuck in 'running'.
          const failedTaskId = (approval.payload as any)?.__task_id
          if (failedTaskId && approval.goal_id) {
            await supabase.from('goal_tasks').update({
              status: 'failed',
              completed_at: new Date().toISOString()
            }).eq('goal_id', approval.goal_id).eq('task_id', failedTaskId)
          }

          await supabase.from('event_log').insert({
            department_slug: approval.department_slug,
            goal_id: approval.goal_id,
            event_type: 'action_execution_failed',
            description: `Execution failed: ${approval.action_label}`,
            metadata: { error: executionError, tool: normalizedAction },
            created_by: user.id
          })
        }
      }
    }

    return NextResponse.json({
      data: updated,
      execution_status: executionFinalStatus,
      execution_error: executionError,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[PATCH /api/approvals/:id]', err)
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 })
  }
}
