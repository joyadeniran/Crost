// POST /api/tools/invoke
// Direct tool invocation from the Orc chat UI (/ prefix commands).
// Calls the executeToolCall gateway exactly as a worker task would.
// Returns the result immediately or signals requires_approval for HITL gating.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerComponentClient } from '@/lib/supabase'
import { executeToolCall } from '@/lib/tools/execute-tool-call'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user }, error: authErr } = await authClient.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { service, action, params = {}, goal_id, task_id } = body

    if (!service || !action) {
      return NextResponse.json(
        { error: 'service and action are required' },
        { status: 400 },
      )
    }

    const result = await executeToolCall({
      userId: user.id,
      departmentId: 'executive', // chat-invoked tools run under executive permissions
      taskId: task_id ?? `chat-${Date.now()}`,
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
      return NextResponse.json({
        success: false,
        requires_approval: true,
        approval_id: (result as any).execution_id,
        message: (result as any).message,
      })
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

    return NextResponse.json({ success: true, result, artifact_id: (result as any).artifact_id ?? null })
  } catch (err: any) {
    console.error('[POST /api/tools/invoke]', err)
    return NextResponse.json(
      { success: false, error: err.message ?? 'Tool invocation failed' },
      { status: 500 },
    )
  }
}
