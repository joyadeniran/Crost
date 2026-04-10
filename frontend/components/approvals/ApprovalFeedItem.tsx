'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApprovalQueueItem, RiskLevel } from '@/types'

interface Props {
  item: ApprovalQueueItem
  onDecision?: (id: string, decision: 'approved' | 'rejected') => void
}

export function ApprovalFeedItem({ item, onDecision }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/approvals/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (res.ok) {
        onDecision?.(item.id, decision)
        router.refresh()
      }
    } catch (err) {
      console.error('Decision failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const expiresAt = new Date(item.expires_at)
  const isExpiringSoon = (expiresAt.getTime() - Date.now()) < 3600 * 1000

  return (
    <div className="approval-item crost-fade-in">
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)' }}>
          {item.department_name} · {item.action_type.replace(/_/g, ' ')}
        </span>
        <span className={`risk-badge ${item.risk_level}`}>{item.risk_level.toUpperCase()}</span>
      </div>

      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
        {item.action_label}
      </div>

      {item.context && (
        <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 8, fontStyle: 'italic' }}>
          &quot;{item.context}&quot;
        </div>
      )}

      {/* Expiry */}
      <div style={{
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 10,
        color: isExpiringSoon ? 'var(--amber)' : 'var(--text-3)',
        marginBottom: 8,
      }}>
        Expires {expiresAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>

      {/* Payload toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 8,
        }}
      >
        {expanded ? '▲ hide payload' : '▼ show payload'}
      </button>

      {expanded && (
        <pre style={{
          fontSize: 10,
          background: 'var(--bg-4)',
          color: 'var(--text-2)',
          borderRadius: 4,
          padding: '8px 10px',
          marginBottom: 10,
          overflow: 'auto',
          maxHeight: 120,
          fontFamily: 'var(--font-dm-mono, monospace)',
        }}>
          {JSON.stringify(item.payload, null, 2)}
        </pre>
      )}

      {/* Buttons */}
      {item.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn-crost btn-approve"
            onClick={() => handleDecision('approved')}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? '…' : '✓ Approve'}
          </button>
          <button
            className="btn-crost btn-reject"
            onClick={() => handleDecision('rejected')}
            disabled={loading}
            style={{ flex: 1 }}
          >
            {loading ? '…' : '✗ Reject'}
          </button>
        </div>
      )}

      {item.status !== 'pending' && (
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 11,
          fontWeight: 500,
          color: item.status === 'approved' ? 'var(--accent)'
               : item.status === 'rejected' ? 'var(--red)'
               : 'var(--text-3)',
        }}>
          {item.status.toUpperCase()}
          {item.decided_by ? ` · ${item.decided_by}` : ''}
        </span>
      )}
    </div>
  )
}
