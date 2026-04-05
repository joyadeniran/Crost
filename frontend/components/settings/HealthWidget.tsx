'use client'

import { useState, useEffect, useCallback } from 'react'

interface ServiceStatus {
  name: string
  status: 'ok' | 'degraded' | 'down'
  latencyMs: number | null
  detail?: string
}

interface HealthData {
  overall: 'ok' | 'degraded' | 'down'
  services: ServiceStatus[]
  checkedAt: string
}

const STATUS_COLOR: Record<string, string> = {
  ok: 'var(--accent)',
  degraded: 'var(--amber)',
  down: 'var(--red)',
}

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  degraded: 'DEGRADED',
  down: 'DOWN',
}

export function HealthWidget() {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const check = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health', { cache: 'no-store' })
      const json = await res.json() as HealthData
      setData(json)
    } catch {
      setError('Could not reach health endpoint')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { check() }, [check])

  return (
    <section style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '18px 20px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Service Health
        </div>
        <button
          onClick={check}
          disabled={loading}
          style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            padding: '3px 10px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-3)',
            cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{error}</p>
      )}

      {data && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.services.map((svc) => (
              <div key={svc.name} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: STATUS_COLOR[svc.status],
                    flexShrink: 0,
                    marginTop: 1,
                  }} />
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{svc.name}</div>
                    {svc.detail && (
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)', marginTop: 2 }}>
                        {svc.detail}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {svc.latencyMs !== null && (
                    <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)' }}>
                      {svc.latencyMs}ms
                    </span>
                  )}
                  <span style={{
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 9,
                    padding: '2px 7px',
                    borderRadius: 4,
                    background: STATUS_COLOR[svc.status] + '18',
                    color: STATUS_COLOR[svc.status],
                    border: `1px solid ${STATUS_COLOR[svc.status]}30`,
                  }}>
                    {STATUS_LABEL[svc.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
            Last checked {new Date(data.checkedAt).toLocaleTimeString()}
          </div>
        </>
      )}

      {loading && !data && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Checking services…</div>
      )}
    </section>
  )
}
