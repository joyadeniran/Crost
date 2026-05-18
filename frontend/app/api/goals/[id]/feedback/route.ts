// /api/goals/[id]/feedback
//
// POST — records founder thumbs-up / thumbs-down on an Orc decision.
//   Writes founder_override=true + outcome to the most recent orc_decision_log
//   row for this goal, and also calls writeOutcomeToDecisionLog so the
//   learning loop can pick it up on the next weekly sweep.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { z } from 'zod'
import { writeOutcomeToDecisionLog } from '@/lib/orc-learning'

export const dynamic = 'force-dynamic'

const FeedbackSchema = z.object({
  outcome: z.enum(['successful', 'failed']),
  override_reason: z.string().max(500).optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = FeedbackSchema.parse(body)

    // Confirm the goal belongs to this user
    const supabase = createServerSupabaseClient()
    const { data: goal } = await supabase
      .from('goals')
      .select('id, created_by')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })

    // Update the most recent orc_decision_log row for this goal
    const { data: logRow } = await supabase
      .from('orc_decision_log')
      .select('id')
      .eq('goal_id', params.id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (logRow) {
      await supabase
        .from('orc_decision_log')
        .update({
          founder_override:  true,
          override_reason:   parsed.override_reason ?? null,
          outcome:           parsed.outcome,
          outcome_at:        new Date().toISOString(),
        })
        .eq('id', logRow.id)
        .eq('user_id', user.id)
    } else {
      // No decision log row yet (e.g. direct-response path) — write via learning helper
      await writeOutcomeToDecisionLog(params.id, parsed.outcome, parsed.override_reason)
    }

    return NextResponse.json({
      success: true,
      outcome: parsed.outcome,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/goals/[id]/feedback]', err)
    return NextResponse.json({ success: false, error: 'Failed to record feedback' }, { status: 500 })
  }
}
