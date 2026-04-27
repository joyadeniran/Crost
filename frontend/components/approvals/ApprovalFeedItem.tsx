'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ApprovalQueueItem, RiskLevel } from '@/types'

const RISK_COLOURS: Record<RiskLevel, string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#fb923c',
  critical: '#f87171'
}

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
  const riskColor = RISK_COLOURS[item.risk_level as RiskLevel] || '#facc15'

  return (
    <div className="approval-item crost-fade-in" style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${riskColor}`,
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Risk Badge (Top Right) */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 20,
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 9,
        fontWeight: 700,
        color: riskColor,
        background: `${riskColor}15`,
        border: `1px solid ${riskColor}33`,
        borderRadius: 4,
        padding: '1px 7px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
      }}>
        {item.risk_level}
      </div>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28,
          borderRadius: 8,
          background: 'var(--bg-3)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14
        }}>
          ⏸
        </div>
        <div>
          <div style={{ 
            fontFamily: 'var(--font-dm-mono, monospace)', 
            fontSize: 10, 
            color: 'var(--text-4)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            {item.department_name} · {item.action_type.replace(/_/g, ' ')}
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginTop: 2 }}>
            {item.action_label}
          </div>
        </div>
      </div>

      {item.context && (
        <div style={{ 
          fontSize: 12, 
          color: 'var(--text-2)', 
          lineHeight: 1.5, 
          marginBottom: 12, 
          fontStyle: 'italic',
          background: 'rgba(255,255,255,0.02)',
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.04)'
        }}>
          &quot;{item.context}&quot;
        </div>
      )}

      {/* Payload / Details */}
      {item.payload && Object.keys(item.payload).length > 0 && (
        <div style={{ marginBottom: 16 }}>
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
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            {expanded ? '▲ HIDE DETAILS' : '▼ SHOW DETAILS'}
          </button>

          {expanded && (
            <div style={{
              marginTop: 10,
              fontSize: 11,
              background: 'var(--bg-4)',
              color: 'var(--text-2)',
              borderRadius: 8,
              padding: '12px 14px',
              border: '1px solid rgba(255,255,255,0.05)',
              fontFamily: 'var(--font-dm-mono, monospace)',
            }}>
              {Object.entries(item.payload).map(([key, val]) => (
                <div key={key} style={{ marginBottom: 6, display: 'flex', gap: 10 }}>
                  <span style={{ color: 'var(--accent)', opacity: 0.8, flexShrink: 0, fontWeight: 600 }}>{key}:</span>
                  <span style={{ wordBreak: 'break-word', color: 'var(--text-3)' }}>
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 16,
        paddingTop: 16,
        borderTop: '1px solid rgba(255,255,255,0.04)'
      }}>
        <div style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: isExpiringSoon ? 'var(--amber)' : 'var(--text-4)',
        }}>
          EXPIRES: {expiresAt.toLocaleString()}
        </div>

        {/* Buttons */}
        {item.status === 'pending' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => handleDecision('approved')}
              disabled={loading}
              style={{
                background: 'rgba(74,222,128,0.1)',
                color: '#4ade80',
                border: '1px solid rgba(74,222,128,0.3)',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-dm-mono, monospace)'
              }}
            >
              {loading ? '...' : 'APPROVE'}
            </button>
            <button
              onClick={() => handleDecision('rejected')}
              disabled={loading}
              style={{
                background: 'rgba(248,113,113,0.1)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.3)',
                borderRadius: 6,
                padding: '6px 16px',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'var(--font-dm-mono, monospace)'
              }}
            >
              {loading ? '...' : 'REJECT'}
            </button>
          </div>
        ) : (
          <span style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            fontWeight: 700,
            color: item.status === 'approved' ? 'var(--accent)'
                 : item.status === 'rejected' ? 'var(--red)'
                 : 'var(--text-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em'
          }}>
            {item.status} {item.decided_by ? `· BY ${item.decided_by.toUpperCase()}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}
