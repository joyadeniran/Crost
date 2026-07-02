// GET /api/goals   — list all goals, newest first
// POST /api/goals  — create a goal and trigger the orchestrator

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { runOrchestratorTask } from '@/lib/llm-client'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const CreateGoalSchema = z.object({
  founder_input: z.string().min(5, 'Goal must be at least 5 characters').max(2000),
})

// GET /api/goals
export async function GET(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20), 100)

    let query = supabase
      .from('goals')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (status) query = query.eq('status', status)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/goals]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch goals', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

// POST /api/goals
export async function POST(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const body = await req.json()
    const { founder_input } = CreateGoalSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    // Derive a short title from the first ~60 chars of input
    const title = founder_input.length > 60
      ? founder_input.slice(0, 57) + '…'
      : founder_input

    // Step 1: Insert the goal as 'pending'
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .insert({ title, founder_input, status: 'pending', created_by: user.id })
      .select()
      .single()

    if (goalError) throw new Error(goalError.message)

    // Step 2: Log goal_received event
    await supabase.from('event_log').insert({
      department_slug: 'orchestrator',
      goal_id: goal.id,
      event_type: 'task_started',
      description: `Goal received: "${title}"`,
      metadata: { goal_id: goal.id },
      created_by: user.id,
    })

    // Step 3: Update status to 'planning' so the UI reflects the active orc run
    await supabase.from('goals').update({ status: 'planning' }).eq('id', goal.id)

    // Step 4: Run orchestrator asynchronously — return immediately so UI can poll
    // We do NOT await this — the client polls /api/goals/[id] for status updates.
    runOrchestratorTask(founder_input, goal.id).catch(async (err) => {
      console.error('[POST /api/goals] Orchestrator failed:', err)
      
      const { logEvent } = await import('@/lib/llm-client')
      const errorMessage = String(err)
      const isQuota = errorMessage.includes('SYSTEM_LIMIT_EXCEEDED')

      await logEvent({
        event_type: isQuota ? 'token_limit_hit' : 'error',
        department_slug: 'orchestrator',
        goal_id: goal.id,
        description: isQuota ? 'Daily free limit reached during planning.' : `Planning failed: ${errorMessage.slice(0, 150)}`,
        error_code: isQuota ? 'SYSTEM_LIMIT_EXCEEDED' : 'PLANNING_FAILURE',
        created_by: user.id,
        metadata: { error: errorMessage }
      }).catch(() => {})

      await supabase
        .from('goals')
        .update({ status: 'failed', outcome: errorMessage })
        .eq('id', goal.id)
        .eq('created_by', user.id)
    })

    const responseBody = {
      success: true,
      data: goal,
      timestamp: new Date().toISOString(),
    }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 201)

    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() },
        { status: 400 }
      )
    }
    console.error('[POST /api/goals]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to create goal', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
