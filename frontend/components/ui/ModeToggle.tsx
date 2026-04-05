'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCrostStore } from '@/lib/store'

export function ModeToggle() {
  const { envMode, setEnvMode } = useCrostStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const switchTo = async (next: 'local' | 'cloud') => {
    if (loading || next === envMode) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      })
      const json = await res.json() as { success?: boolean; error?: string; mode?: string }
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Toggle failed')
        return
      }
      setEnvMode(next)
      router.refresh()
    } catch {
      setError('Network error — could not switch mode')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
      <div className="mode-toggle-pill" style={{ opacity: loading ? 0.6 : 1 }}>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          paddingLeft: 6,
          paddingRight: 2,
          letterSpacing: '0.05em',
        }}>
          MODE
        </span>
        <button
          className={`mode-toggle-btn local ${envMode === 'local' ? 'active' : ''}`}
          onClick={() => switchTo('local')}
          disabled={loading}
        >
          LOCAL
        </button>
        <button
          className={`mode-toggle-btn cloud ${envMode === 'cloud' ? 'active' : ''}`}
          onClick={() => switchTo('cloud')}
          disabled={loading}
        >
          CLOUD
        </button>
      </div>
      {error && (
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--red)',
          maxWidth: 160,
          textAlign: 'right',
        }}>
          {error}
        </span>
      )}
    </div>
  )
}
