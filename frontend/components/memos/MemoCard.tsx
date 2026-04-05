'use client'

import { CompanyMemo } from '@/types'

interface Props {
  memo: CompanyMemo
}

export function MemoCard({ memo }: Props) {
  const createdAt = new Date(memo.created_at)

  return (
    <div className={`memo-item ${memo.priority}`}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
        <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--text)' }}>{memo.title}</div>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--text-3)',
          flexShrink: 0,
        }}>
          {createdAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 8 }}>
        {memo.body}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--text-3)' }}>
          from {memo.from_department}
        </span>
        {(memo.tags || []).map(tag => (
          <span key={tag} style={{
            padding: '1px 7px',
            borderRadius: 8,
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 9,
            background: 'var(--bg-4)',
            color: 'var(--text-3)',
          }}>
            {tag}
          </span>
        ))}
      </div>
    </div>
  )
}
