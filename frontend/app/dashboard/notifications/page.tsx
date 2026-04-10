export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { ApprovalFeedItem } from '@/components/approvals/ApprovalFeedItem'
import { ApprovalQueueItem, EventLogEntry } from '@/types'

export default async function NotificationsPage() {
  const supabase = createServerSupabaseClient()
  
  // Fetch pending approvals + recent event log entries
  const [approvalsRes, eventsRes] = await Promise.all([
    supabase
      .from('approval_queue')
      .select('*')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false }),
    supabase
      .from('event_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)
  ])

  const pendingApprovals = (approvalsRes.data ?? []) as ApprovalQueueItem[]
  const recentEvents = (eventsRes.data ?? []) as EventLogEntry[]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 24, color: 'var(--text)', marginBottom: 2 }}>
          Inbox
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Approvals, system updates, and agency activity.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 32, alignItems: 'start' }}>
        {/* Left Column: Approvals */}
        <div>
          <div className="crost-section-label">Pending Approvals</div>
          {pendingApprovals.length === 0 ? (
            <div style={{
              background: 'var(--bg-2)',
              border: '1px dotted var(--border)',
              borderRadius: 8,
              padding: '40px',
              textAlign: 'center',
              color: 'var(--text-3)',
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 12
            }}>
              No pending actions. You&apos;re all clear.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pendingApprovals.map(item => (
                <ApprovalFeedItem key={item.id} item={item} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 48 }}>
            <div className="crost-section-label">Recent Activity</div>
            <div style={{ 
              background: 'var(--bg-2)', 
              border: '1px solid var(--border)', 
              borderRadius: 8, 
              padding: '4px' 
            }}>
              {recentEvents.map((event, i) => (
                <div key={event.id} style={{ 
                  padding: '12px 16px', 
                  borderBottom: i === recentEvents.length - 1 ? 'none' : '1px solid var(--border)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start'
                }}>
                   <div style={{ 
                     width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', marginTop: 5,
                     opacity: 0.5
                    }} />
                   <div>
                     <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.4 }}>
                       {event.description}
                     </div>
                     <div style={{ 
                       fontFamily: 'var(--font-dm-mono, monospace)', 
                       fontSize: 10, 
                       color: 'var(--text-4)',
                       marginTop: 4
                      }}>
                       {event.department_slug?.toUpperCase()} · {new Date(event.created_at).toLocaleString()}
                     </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Context/Stats */}
        <div>
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
            marginBottom: 20
          }}>
             <h3 style={{ fontFamily: 'var(--font-syne, Syne)', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Summary</h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-3)' }}>Pending Approvals</span>
                  <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-dm-mono, monospace)' }}>{pendingApprovals.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-3)' }}>Activity (24h)</span>
                  <span style={{ color: 'var(--text-2)', fontFamily: 'var(--font-dm-mono, monospace)' }}>{recentEvents.length}</span>
                </div>
             </div>
          </section>

          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '20px'
          }}>
             <h3 style={{ fontFamily: 'var(--font-syne, Syne)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Human-in-the-Loop</h3>
             <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
               Crost&apos;s safety architecture ensures that irreversible actions are always gated by founder approval.
             </p>
          </section>
        </div>
      </div>
    </div>
  )
}
