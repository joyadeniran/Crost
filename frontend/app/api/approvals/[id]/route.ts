import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { Composio } from "@composio/core"
import { cleanLargePayload } from "@/lib/utils"

export const dynamic = 'force-dynamic'

interface Params { params: { id: string } }

const DecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decided_by: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', params.id)
      .eq('created_by', user.id)
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
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const body = await req.json()
    const { decision, decided_by } = DecisionSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Fetch the approval to validate it's pending and belongs to user
    const { data: approval, error: fetchErr } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (fetchErr || !approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot decide on approval with status "${approval.status}"` },
        { status: 409 }
      )
    }

    // Update approval status
    const { data: updated, error: updateErr } = await supabase
      .from('approval_queue')
      .update({ status: decision, decided_at: new Date().toISOString(), decided_by })
      .eq('id', params.id)
      .eq('created_by', user.id)
      .select()
      .single()

    if (updateErr) throw updateErr

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
            'x-crost-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
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
      const { SUPPORTED_TOOLKITS } = await import('@/lib/composio-tools')

      // When action_type was normalised to 'tool_call' during enqueue, the real
      // composio action name is stashed in payload.__tool_action.
      const rawComposioAction: string | null =
        (approval.payload as any)?.__tool_action
        ?? (approval.action_type !== 'tool_call' ? approval.action_type : null)
      const composioActionForCall = rawComposioAction ?? approval.action_type
      const normalizedAction = (composioActionForCall || '').toLowerCase()
      // Derive the composio toolkit slug from the action (e.g. GMAIL_SEND_EMAIL → gmail)
      const composioService = SUPPORTED_TOOLKITS.find(kit => normalizedAction.startsWith(kit + '_'))
        ?? ((approval.payload as any)?.__service ?? null)
      const isComposioAction = !!process.env.COMPOSIO_API_KEY && (
        !!composioService ||
        (composioActionForCall.includes('_') && composioActionForCall === composioActionForCall.toUpperCase())
      )

      const isInternalTool = ['supabase_query', 'company_memos', 'save_document', 'get_sales_data'].includes(normalizedAction)

      if (isComposioAction || isInternalTool) {
        try {
          let result: any;

          if (isComposioAction) {
            // Pre-flight: verify the user has a connected account for this service
            const serviceSlug = composioService
              ?? (approval.action_type.split('_')[0] ?? '').toLowerCase()
            if (serviceSlug) {
              const { data: connRow } = await supabase
                .from('connections')
                .select('status')
                .eq('user_id', user.id)
                .eq('tool_slug', serviceSlug)
                .maybeSingle()
              if (!connRow || connRow.status !== 'connected') {
                throw new Error(`${serviceSlug.toUpperCase()} is not connected. Connect it in Settings → Integrations, then re-run this action.`)
              }
            }

            console.log(`[Approval Execution] Executing Composio action "${composioActionForCall}" for user ${user.id}`)
            const { Composio } = await import("@composio/core")
            const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
            const entity = await composio.create(user.id)
            // Strip internal metadata keys before sending to composio
            const execPayload = { ...(approval.payload as any) }
            delete execPayload.__tool_action
            delete execPayload.__service
            result = await (entity as any).executeAction(composioActionForCall, execPayload)
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
                'x-crost-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
              },
              body: JSON.stringify({ task_id: 'CHAIN_REACTION' })
            }).catch(e => console.error('[Approval Execution] Chain reaction failed:', e))
          }
          
        } catch (execErr: any) {
          console.error(`[Approval Execution Failure]`, execErr)
          executionError = execErr?.message ?? 'Unknown execution failure'
          executionFinalStatus = 'failed'
          await supabase.from('approval_queue').update({
            status: 'failed',
            execution_result: { error: executionError }
          }).eq('id', params.id)

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
            event_type: 'tool_failed',
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
