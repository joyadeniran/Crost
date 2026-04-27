export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ApprovalFeedItem } from '@/components/approvals/ApprovalFeedItem'
import { ApprovalsLiveRefresh } from '@/components/approvals/ApprovalsLiveRefresh'
import { ApprovalQueueItem } from '@/types'

export default async function ApprovalsPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('approval_queue')
    .select('*')
    .or(`created_by.eq.${user.id},user_id.eq.${user.id}`)
    .order('requested_at', { ascending: false })
    .limit(50)

  const approvals = (data ?? []) as ApprovalQueueItem[]
  const pending = approvals.filter(a => a.status === 'pending')
  const resolved = approvals.filter(a => a.status !== 'pending')

  return (
    <div>
      <ApprovalsLiveRefresh />
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 2 }}>
            Approval Feed
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Human-in-the-loop gate for irreversible actions
          </p>
        </div>
        {pending.length > 0 && (
          <span style={{
            borderRadius: 20,
            background: 'rgba(255,179,71,0.12)',
            color: 'var(--amber)',
            border: '1px solid rgba(255,179,71,0.2)',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            fontWeight: 500,
            padding: '4px 10px',
          }}>
            {pending.length} pending
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <div className="crost-section-label">Pending</div>
          {pending.map(item => <ApprovalFeedItem key={item.id} item={item} />)}
        </section>
      )}

      {resolved.length > 0 && (
        <section style={{ opacity: 0.6 }}>
          <div className="crost-section-label">Resolved</div>
          {resolved.map(item => <ApprovalFeedItem key={item.id} item={item} />)}
        </section>
      )}

      {approvals.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>OK</div>
          All caught up - no pending approvals
        </div>
      )}
    </div>
  )
}
