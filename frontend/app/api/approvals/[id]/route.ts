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
    if (decision === 'approved') {
      const { SUPPORTED_TOOLKITS } = await import('@/lib/composio-tools')
      
      const normalizedAction = approval.action_type.toLowerCase()
      const isComposioAction = process.env.COMPOSIO_API_KEY && (
        SUPPORTED_TOOLKITS.some(kit => normalizedAction.startsWith(kit + '_')) || 
        (approval.action_type.includes('_') && approval.action_type === approval.action_type.toUpperCase())
      )
      
      const isInternalTool = ['supabase_query', 'company_memos', 'save_document', 'get_sales_data'].includes(normalizedAction)

      if (isComposioAction || isInternalTool) {
        try {
          let result: any;

          if (isComposioAction) {
            console.log(`[Approval Execution] Executing Composio action "${approval.action_type}" for user ${user.id}`)
            const { Composio } = await import("@composio/core")
            const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
            const entity = await composio.create(user.id)
            result = await (entity as any).executeAction(approval.action_type, approval.payload)
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

          await supabase.from('event_log').insert({
            department_slug: approval.department_slug,
            goal_id: approval.goal_id,
            event_type: 'action_executed',
            description: `Executed approved action: ${approval.action_label}`,
            metadata: { result: cleanLargePayload(result), tool: normalizedAction },
            created_by: user.id
          })

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
          await supabase.from('approval_queue').update({
            status: 'failed',
            execution_result: { error: execErr.message }
          }).eq('id', params.id)
        }
      }
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[PATCH /api/approvals/:id]', err)
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 })
  }
}
