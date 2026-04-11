import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('goals')
      .select('*, goal_tasks(*)')
      .eq('id', params.id)
      .eq('created_by', user.id)
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
  status: z.enum(['pending', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed', 'cancelled']).optional(),
  outcome: z.string().optional(),
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
    const parsed = UpdateGoalSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('goals')
      .update(parsed)
      .eq('id', params.id)
      .eq('created_by', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: 'Goal not found or access denied', code: 'NOT_FOUND', timestamp: new Date().toISOString() },
        { status: 404 }
      )
    }

    // Trigger Orchestrator Synthesis if goal is being completed manually
    if (parsed.status === 'completed') {
      const { runOrcReport } = await import('@/lib/llm-client')
      runOrcReport(params.id).catch(err => {
        console.error('[PATCH /api/goals/:id] Synthesis failed:', err)
      })
    }

    // On cancel: reject all non-terminal tasks so the chain stops cleanly
    if (parsed.status === 'cancelled') {
      const supabase = createServerSupabaseClient()
      await supabase
        .from('goal_tasks')
        .update({ status: 'rejected', completed_at: new Date().toISOString() })
        .eq('goal_id', params.id)
        .not('status', 'in', '(completed,failed,rejected,expired)')
    }

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
