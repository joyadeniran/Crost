// POST /api/cron/orc-learning
//
// Weekly cron that sweeps all users with recent resolved decisions through the
// learning loop: computes mode/tier success rates and adjusts orc_context
// recency scores accordingly.
//
// Authenticated via x-cron-secret header.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { computeLearningInsights, adjustRecencyScores } from '@/lib/orc-learning'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const lookbackDays = 7

  // Find all distinct users with resolved decisions in the lookback window
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const { data: userRows, error } = await supabase
    .from('orc_decision_log')
    .select('user_id')
    .gte('outcome_at', since)
    .not('outcome', 'is', null)

  if (error) {
    console.error('[cron/orc-learning] Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  const userIds = [...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id))]

  if (userIds.length === 0) {
    return NextResponse.json({ success: true, usersProcessed: 0, timestamp: new Date().toISOString() })
  }

  const results: Array<{
    userId: string
    insights: { totalDecisions: number; resolvedDecisions: number; overallSuccessRate: number }
    adjustmentsMade: number
    error?: string
  }> = []

  for (const userId of userIds) {
    try {
      const userIdStr = String(userId)
      const [insights, adjustmentsMade] = await Promise.all([
        computeLearningInsights(userIdStr, lookbackDays),
        adjustRecencyScores(userIdStr, lookbackDays),
      ])

      results.push({
        userId: userIdStr,
        insights: {
          totalDecisions: insights.totalDecisions,
          resolvedDecisions: insights.resolvedDecisions,
          overallSuccessRate: insights.overallSuccessRate,
        },
        adjustmentsMade,
      })
    } catch (err: any) {
      console.error(`[cron/orc-learning] Failed for user ${userId}:`, err)
      results.push({ userId: String(userId), insights: { totalDecisions: 0, resolvedDecisions: 0, overallSuccessRate: 0 }, adjustmentsMade: 0, error: err?.message ?? 'unknown' })
    }
  }

  return NextResponse.json({
    success: true,
    usersProcessed: userIds.length,
    results,
    timestamp: new Date().toISOString(),
  })
}
