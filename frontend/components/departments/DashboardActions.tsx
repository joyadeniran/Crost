'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateDepartmentWizard } from './CreateDepartmentWizard'

export function DashboardActions() {
  const [wizardOpen, setWizardOpen] = useState(false)
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

      <button
        onClick={() => setWizardOpen(true)}
        className="btn-primary-crost"
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        New Department
      </button>
      {wizardOpen && <CreateDepartmentWizard onClose={() => setWizardOpen(false)} />}
    </div>
  )
}
