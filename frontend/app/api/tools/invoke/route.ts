// POST /api/tools/invoke
// Direct tool invocation from the Orc chat UI (/ prefix commands).
// Calls the executeToolCall gateway exactly as a worker task would.
// Returns the result immediately or signals requires_approval for HITL gating.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { executeToolCall } from '@/lib/tools/execute-tool-call'
import { logEvent } from '@/lib/llm-client'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user }, error: authErr } = await authClient.auth.getUser()
  
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  let { service, action, params = {}, goal_id, task_id } = body

  try {
    if (!service || !action) {
      return NextResponse.json(
        { error: 'service and action are required' },
        { status: 400 },
      )
    }

    // NATURAL LANGUAGE PARAMETER RESOLUTION (Spec §14)
    const supabase = createServerSupabaseClient()
    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    // If the founder used a slash command with raw text (e.g. /gmail.send_email hello to joy@...),
    // the UI sends { text: "..." }. We use a fast LLM to parse this into the tool's expected schema.
    if (params && typeof params === 'object' && Object.keys(params).length === 1 && 'text' in params && typeof params.text === 'string') {
      const { resolveToolParameters } = await import('@/lib/tools/parameter-resolver')
      console.log(`[invoke] Resolving parameters for ${service}.${action} from text: "${params.text}"`)
      const resolved = await resolveToolParameters(service, action, params.text, user.id)
      if (resolved && Object.keys(resolved).length > 0) {
        console.log(`[invoke] Resolved parameters:`, resolved)
        params = resolved
      }
    }

    const result = await executeToolCall({
      userId: user.id,
      departmentId: 'executive', // chat-invoked tools run under executive permissions
      taskId: task_id ?? crypto.randomUUID(), // Use UUID for DB compatibility
      goalId: goal_id || null,
      toolCall: {
        service,
        action,
        params,
        reasoning: `Founder invoked directly via /${service}.${action} chat command`,
        risk: (body.risk as any) ?? 'medium',
        requiresApproval: false, // gateway will override for high/critical tools
      },
    })

    // Normalise gateway responses so the UI always gets a consistent shape
    if ((result as any).status === 'requires_approval') {
      const responseBody = {
        success: false,
        requires_approval: true,
        approval_id: (result as any).approval_id, // THE FIX: Use actual approval_id
        message: (result as any).message,
      }
      await completeIdempotentRequest(req, supabase, user.id, responseBody, 200)
      return NextResponse.json(responseBody)
    }

    if ((result as any).status === 'missing_connection') {
      return NextResponse.json({
        success: false,
        missing_connection: true,
        service,
        message: (result as any).message,
      })
    }

    if ((result as any).status === 'permission_denied') {
      return NextResponse.json(
        { success: false, error: (result as any).message },
        { status: 403 },
      )
    }

    const responseBody = { success: true, result, artifact_id: (result as any).artifact_id ?? null }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 200)
    return NextResponse.json(responseBody)
  } catch (err: any) {
    console.error('[POST /api/tools/invoke]', err)
    
    // Log failure in Live Events (Spec §7)
    await logEvent({
      event_type: 'task_failed',
      department_slug: 'executive',
      goal_id: goal_id || null,
      description: `Direct tool invocation failed: /${service}.${action}. ${err.message || ''}`,
      created_by: user.id
    })

    return NextResponse.json(
      { success: false, error: err.message ?? 'Tool invocation failed' },
      { status: 500 },
    )
  }
}
