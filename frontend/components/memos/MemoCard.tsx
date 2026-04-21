'use client'

import { CompanyMemo } from '@/types'

interface Props {
  memo: CompanyMemo
}

export function MemoCard({ memo }: Props) {
  const createdAt = new Date(memo.created_at)

  return (
    <div className={`memo-item glass-card ${memo.priority}`} style={{ padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{memo.title}</div>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--text-4)',
          flexShrink: 0,
          background: 'var(--bg-4)',
          padding: '2px 6px',
          borderRadius: '4px'
        }}>
          {createdAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 12 }}>
        {memo.body}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ 
          fontFamily: 'var(--font-dm-mono, monospace)', 
          fontSize: 10, 
          color: 'var(--accent)',
          background: 'var(--accent-dim)',
          padding: '2px 8px',
          borderRadius: '4px'
        }}>
          from {memo.from_department}
        </span>
        {(memo.tags || []).map(tag => (
          <span key={tag} className="crost-badge" style={{ background: 'var(--bg-3)', color: 'var(--text-3)', fontSize: '9px' }}>
            #{tag}
          </span>
        ))}
      </div>
    </div>
  )
}
