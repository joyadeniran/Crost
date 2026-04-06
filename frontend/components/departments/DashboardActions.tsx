'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export function DashboardActions() {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const router = useRouter()

  const handleSync = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const res = await fetch('/api/departments/resync', { method: 'POST' })
      const json = await res.json()
      setSyncMsg(json.synced === 0 ? 'All synced' : `${json.synced} synced`)
      router.refresh()
    } catch {
      setSyncMsg('Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMsg(null), 3000)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {/* Always-visible sync button — shows result inline */}
      <button
        onClick={handleSync}
        disabled={syncing}
        title="Re-sync all departments with the LLM backend"
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: syncMsg ? (syncMsg.includes('failed') ? 'var(--red)' : 'var(--accent)') : 'var(--text-3)',
          cursor: syncing ? 'not-allowed' : 'pointer',
          opacity: syncing ? 0.6 : 1,
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}
      >
        {syncing ? '⟳ Syncing…' : syncMsg ?? '⟳ Sync'}
      </button>

      <Link
        href="/dashboard/departments/new"
        className="btn-primary-crost"
        style={{ textDecoration: 'none' }}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        New Department
      </Link>
    </div>
  )
}
