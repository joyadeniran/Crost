'use client'

import { useCrostStore } from '@/lib/store'

export function ModeToggle() {
  const { envMode } = useCrostStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <div className="mode-toggle-pill" style={{ opacity: 0.9, background: 'rgba(255,255,255,0.03)' }}>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          paddingLeft: 8,
          paddingRight: 8,
          letterSpacing: '0.08em',
        }}>
          INFRASTRUCTURE: <span style={{ color: 'var(--teal)', fontWeight: 'bold' }}>CLOUD</span>
        </span>
      </div>
    </div>
  )
}
