'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  slug: string
}

export function ForceResetButton({ slug }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleReset = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/departments/${slug}/reset`, { method: 'POST' })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Reset failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleReset}
        disabled={loading}
        title="Force reset this department — clears the stuck 'running' state"
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 11,
          padding: '7px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255,179,71,0.4)',
          background: 'rgba(255,179,71,0.08)',
          color: 'var(--amber)',
          cursor: 'pointer',
          opacity: loading ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {loading ? 'Resetting…' : '⚡ Force Reset'}
      </button>
      {error && (
        <span style={{ fontSize: 10, color: 'var(--red)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
          {error}
        </span>
      )}
    </div>
  )
}
