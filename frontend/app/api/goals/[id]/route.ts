// GET /api/goals/[id]    — get a single goal with its orchestrator plan
// PATCH /api/goals/[id]  — update goal status (e.g. mark as executing/completed)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { z } from 'zod'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('id', params.id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: 'Goal not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[GET /api/goals/[id]]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch goal', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}

const UpdateGoalSchema = z.object({
  status: z.enum(['pending', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed']).optional(),
  outcome: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    // Auth gate removed for local founder access

    const body = await req.json()
    const parsed = UpdateGoalSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('goals')
      .update(parsed)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() },
        { status: 400 }
      )
    }
    console.error('[PATCH /api/goals/[id]]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to update goal', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
