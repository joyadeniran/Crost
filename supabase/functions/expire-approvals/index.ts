// Supabase Edge Function: expire-approvals
// Runs hourly via pg_cron.
// Finds pending approvals past their expiry time and marks them expired.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const now = new Date().toISOString()

  // Find all pending approvals that have expired
  const { data: expired, error: fetchError } = await supabase
    .from('approval_queue')
    .select('id, department_id, department_slug, action_label')
    .eq('status', 'pending')
    .lt('expires_at', now)

  if (fetchError) {
    console.error('Error fetching expired approvals:', fetchError.message)
    return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ expired: 0 }), { status: 200 })
  }

  const ids = expired.map((a: { id: string }) => a.id)

  // Mark them all expired
  const { error: updateError } = await supabase
    .from('approval_queue')
    .update({ status: 'expired', decided_at: now })
    .in('id', ids)

  if (updateError) {
    console.error('Error expiring approvals:', updateError.message)
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500 })
  }

  // Log each expiry to event_log
  const logEntries = expired.map((a: { id: string; department_id: string; department_slug: string; action_label: string }) => ({
    department_id: a.department_id,
    department_slug: a.department_slug,
    event_type: 'approval_expired',
    description: `Approval expired: ${a.action_label}`,
    metadata: { approval_id: a.id }
  }))

  const { error: logError } = await supabase.from('event_log').insert(logEntries)
  if (logError) {
    console.error('Error logging expiry events:', logError.message)
  }

  // Reset department status from awaiting_approval to idle where relevant
  for (const approval of expired) {
    await supabase
      .from('departments')
      .update({ status: 'idle' })
      .eq('id', approval.department_id)
      .eq('status', 'awaiting_approval')
  }

  console.log(`Expired ${ids.length} approval(s)`)
  return new Response(JSON.stringify({ expired: ids.length }), { status: 200 })
})
