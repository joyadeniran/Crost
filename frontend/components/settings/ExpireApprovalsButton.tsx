'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ExpireApprovalsButton() {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ expired: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleExpire = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/approvals/expire', { method: 'POST' })
      const json = await res.json() as { expired?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setResult({ expired: json.expired ?? 0 })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        onClick={handleExpire}
        disabled={running}
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 11,
          padding: '6px 16px',
          borderRadius: 8,
          border: '1px solid var(--border)',
          background: 'var(--bg-3)',
          color: 'var(--text-2)',
          cursor: 'pointer',
          opacity: running ? 0.6 : 1,
        }}
      >
        {running ? 'Running…' : 'Expire Old Approvals'}
      </button>
      {result && (
        <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
          {result.expired === 0 ? 'Nothing to expire' : `✓ Expired ${result.expired} approval${result.expired === 1 ? '' : 's'}`}
        </span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>
      )}
    </div>
  )
}
