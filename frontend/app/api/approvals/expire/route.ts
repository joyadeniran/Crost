// POST /api/approvals/expire — marks pending approvals older than 24h as expired
// Called every hour by the crost-approval-expiry cron job via x-cron-secret header.
// Can also be called manually from the Settings page (same secret required).

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireCronSecret } from '@/lib/auth/cron'

export const dynamic = 'force-dynamic'

async function handle(req: NextRequest) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  try {
    const supabase = createServerSupabaseClient()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: expired, error } = await supabase
      .from('approval_queue')
      .update({
        status: 'expired',
        decided_by: 'system_expiration',
        decided_at: new Date().toISOString(),
      })
      .eq('status', 'pending')
      .lt('requested_at', cutoff)
      .select('id, department_name, action_label')

    if (error) throw error

    // Log each expiration
    if (expired && expired.length > 0) {
      await supabase.from('event_log').insert(
        expired.map((item: any) => ({
          event_type: 'approval_expired',
          description: `Approval request "${item.action_label}" from ${item.department_name} expired after 24h`,
          metadata: { approval_id: item.id },
        }))
      )
    }

    return NextResponse.json({
      success: true,
      expired: expired?.length ?? 0,
      expiredIds: expired?.map((i: any) => i.id) ?? [],
    })
  } catch (err) {
    console.error('[POST /api/approvals/expire]', err)
    return NextResponse.json({ error: 'Failed to expire approvals' }, { status: 500 })
  }
}

// POST for manual callers; GET because Vercel Cron issues GET requests.
export const POST = handle
export const GET = handle
