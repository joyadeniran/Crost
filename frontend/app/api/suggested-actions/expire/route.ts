// POST /api/suggested-actions/expire — marks un-tapped suggested_actions
// older than 14 days as 'dismissed', per spec §6.1 lifecycle: "Suggestions
// auto-expire after 14 days. The reasoning: stale suggestions clutter the
// dashboard and erode trust." Mirrors app/api/approvals/expire/route.ts's
// cron-secret pattern (Phase 5, 10x rebuild).
//
// Only rows still in 'suggested' status are touched — a founder who already
// tapped a chip (status moved to 'tapped'/'approved'/'executing') is mid-flow
// and should never be silently auto-dismissed out from under them. The
// suggested_action_status DB enum (cloudsql_migration.sql) has no distinct
// 'expired' value, so this reuses 'dismissed' — the same terminal state a
// manual founder dismissal produces, consistent with spec's own framing of
// dismissed suggestions as a single recoverable history list.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const provided = req.headers.get('x-cron-secret')
  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = createServerSupabaseClient()
    const cutoff = new Date(Date.now() - EXPIRY_MS).toISOString()

    const { data: expired, error } = await supabase
      .from('suggested_actions')
      .update({
        status: 'dismissed',
        resolved_at: new Date().toISOString(),
      })
      .eq('status', 'suggested')
      .lt('created_at', cutoff)
      .select('id, action_slug, label, created_by')

    if (error) throw error

    if (expired && expired.length > 0) {
      await supabase.from('event_log').insert(
        expired.map((item: any) => ({
          event_type: 'suggested_action_expired',
          description: `Suggested action "${item.label}" (${item.action_slug}) auto-expired after 14 days`,
          metadata: { suggested_action_id: item.id },
          created_by: item.created_by,
        }))
      )
    }

    return NextResponse.json({
      success: true,
      expired: expired?.length ?? 0,
      expiredIds: expired?.map((i: any) => i.id) ?? [],
    })
  } catch (err) {
    console.error('[POST /api/suggested-actions/expire]', err)
    return NextResponse.json({ error: 'Failed to expire suggested actions' }, { status: 500 })
  }
}
