// GET /api/goals   — list all goals, newest first
// POST /api/goals  — create a goal and trigger the orchestrator

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { runOrchestratorTask } from '@/lib/onyx-client'
import { z } from 'zod'

const CreateGoalSchema = z.object({
  founder_input: z.string().min(5, 'Goal must be at least 5 characters').max(2000),
})

// GET /api/goals
export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const limit = Number(searchParams.get('limit') ?? '20')

    let query = supabase
      .from('goals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100))

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
    const body = await req.json()
    const { founder_input } = CreateGoalSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Derive a short title from the first ~60 chars of input
    const title = founder_input.length > 60
      ? founder_input.slice(0, 57) + '…'
      : founder_input

    // Step 1: Insert the goal as 'pending'
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .insert({ title, founder_input, status: 'pending' })
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
    })

    // Step 3: Run orchestrator asynchronously — return immediately so UI can poll
    // We do NOT await this — the client polls /api/goals/[id] for status updates.
    runOrchestratorTask(founder_input, goal.id).catch(async (err) => {
      console.error('[POST /api/goals] Orchestrator failed:', err)
      await supabase
        .from('goals')
        .update({ status: 'failed', outcome: String(err) })
        .eq('id', goal.id)
    })

    return NextResponse.json({
      success: true,
      data: goal,
      timestamp: new Date().toISOString(),
    }, { status: 201 })
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
