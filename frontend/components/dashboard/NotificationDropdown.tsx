'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase-browser'
import { ApprovalQueueItem } from '@/types'

/**
 * A notification dropdown that shows pending approvals at a glance.
 */
export function NotificationDropdown({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ApprovalQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchPending = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setItems([])
        setLoading(false)
        return
      }

      const { data } = await supabaseClient
        .from('approval_queue')
        .select('*')
        .eq('status', 'pending')
        .or(`user_id.eq.${session.user.id},created_by.eq.${session.user.id}`)
        .order('requested_at', { ascending: false })
        .limit(5)
      setItems(data as ApprovalQueueItem[] || [])
      setLoading(false)
    }

    fetchPending()

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  return (
    <div ref={ref} style={{
      position: 'absolute',
      top: 42,
      right: 0,
      width: 320,
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      zIndex: 1000,
      overflow: 'hidden',
      animation: 'fadeInUp 0.15s ease-out'
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        background: 'var(--bg-3)'
      }}>
        <span style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Notifications
        </span>
        <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--text-3)' }}>
          {items.length} PENDING
        </span>
      </div>

      <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>LOADING…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "32px 20px", textAlign: 'center' }}>
             <div style={{ fontSize: 24, marginBottom: 8 }}>✅</div>
             <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                ALL CAUGHT UP
             </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {items.map(item => (
              <Link
                key={item.id}
                href="/dashboard/approvals"
                onClick={onClose}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '10px 12px',
                  borderRadius: 6,
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                   <span style={{ 
                     fontFamily: 'var(--font-dm-mono, monospace)', 
                     fontSize: 8, 
                     color: 'var(--amber)',
                     textTransform: 'uppercase',
                     letterSpacing: '0.04em'
                    }}>
                     {item.department_slug} · {item.risk_level.toUpperCase()}
                   </span>
                   <span style={{ fontSize: 8, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                      {new Date(item.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500, lineHeight: 1.4 }}>
                  {item.action_type.replace(/_/g, ' ')}: {item.action_label}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/dashboard/approvals"
        onClick={onClose}
        style={{
          display: 'block',
          padding: '10px',
          textAlign: 'center',
          fontSize: 10,
          fontFamily: 'var(--font-dm-mono, monospace)',
          color: 'var(--accent)',
          textDecoration: 'none',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-3)',
          letterSpacing: '0.04em'
        }}
      >
        VIEW ALL HISTORY →
      </Link>
    </div>
  )
}
