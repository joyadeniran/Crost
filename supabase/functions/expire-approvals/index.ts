// supabase/functions/expire-approvals/index.ts
// Supabase Edge Function — runs on a cron schedule (every hour).
// 1. Expires stale pending approvals past their expires_at timestamp.
// 2. Marks corresponding goal_tasks as 'expired'.
// 3. Logs each expiry to event_log.
//
// Deploy: supabase functions deploy expire-approvals
// Schedule: set in Supabase dashboard → Edge Functions → Schedule

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

Deno.serve(async (_req) => {
  const now = new Date().toISOString()

  // 1. Fetch all pending approvals that have passed their expiry
  const { data: expired, error } = await supabase
    .from('approval_queue')
    .select('id, department_slug, goal_id, action_label, expires_at')
    .eq('status', 'pending')
    .lt('expires_at', now)

  if (error) {
    console.error('[expire-approvals] Failed to fetch expired approvals:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ expired: 0 }), { status: 200 })
  }

  const expiredIds = expired.map(e => e.id)

  // 2. Bulk update approval_queue status to 'expired'
  await supabase
    .from('approval_queue')
    .update({ status: 'expired', decided_at: now })
    .in('id', expiredIds)

  // 3. Log each expiry to event_log
  const eventRows = expired.map(e => ({
    event_type: 'approval_expired',
    department_slug: e.department_slug ?? 'orchestrator',
    goal_id: e.goal_id ?? null,
    description: `Approval expired: "${e.action_label}" — window closed at ${e.expires_at}`,
    metadata: { approval_id: e.id },
  }))

  await supabase.from('event_log').insert(eventRows)

  // 4. Mark corresponding goal_tasks as 'expired' for goals with expired approvals
  const goalLinked = expired.filter(e => e.goal_id)
  for (const e of goalLinked) {
    await supabase
      .from('goal_tasks')
      .update({ status: 'expired', completed_at: now })
      .eq('goal_id', e.goal_id)
      .in('status', ['pending', 'approved', 'pending_dependency'])
  }

  console.log(`[expire-approvals] Expired ${expired.length} approval(s).`)
  return new Response(JSON.stringify({ expired: expired.length, ids: expiredIds }), { status: 200 })
})
