'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCrostStore } from '@/lib/store'

interface SyncResult {
  slug: string
  mode: string
}

export function SyncAllButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ synced: number; results: SyncResult[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleSync = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/departments/resync', { method: 'POST' })
      const json = await res.json() as { synced?: number; results?: SyncResult[]; error?: string; message?: string }
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      
      setResult({ synced: json.synced ?? 0, results: json.results ?? [] })
      
      // Spec §11: Proactively fetch fresh departments to update global store
      const deptRes = await fetch('/api/departments?active_only=true')
      if (deptRes.ok) {
        const { data } = await deptRes.json()
        if (data) {
          useCrostStore.getState().setDepartments(data)
        }
      }
      
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 11,
          color: 'var(--accent)',
        }}>
          ✓ {result.synced === 0 ? 'All synced' : `${result.synced} department${result.synced === 1 ? '' : 's'} synced`}
        </span>
        <button
          onClick={() => setResult(null)}
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleSync}
        disabled={loading}
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 11,
          padding: '6px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255,77,109,0.35)',
          background: 'rgba(255,77,109,0.06)',
          color: 'var(--red)',
          cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {loading ? (
          <>⟳ Syncing…</>
        ) : (
          <>⚡ Sync Departments</>
        )}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
