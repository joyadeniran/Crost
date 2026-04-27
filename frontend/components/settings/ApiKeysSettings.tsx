'use client'

import { useState, useEffect } from 'react'
import { formatErrorMessage } from '@/lib/utils'

interface KeyStatus {
  [provider: string]: boolean // provider → is_valid
}

interface UsageData {
  tokensUsed: number
  limit: number
  resetAt: string
  hasUserKey: boolean
}

interface ApiKeyItem {
  label: string
  provider: string  // canonical LiteLLM prefix: 'anthropic' | 'gemini' | 'groq'
  placeholder: string
}

// Canonical providers (LiteLLM prefix convention). OpenAI excluded until next sprint.
const PROVIDERS: ApiKeyItem[] = [
  { label: 'Google Gemini',    provider: 'gemini',    placeholder: 'AIza...'    },
  { label: 'Groq Cloud',       provider: 'groq',      placeholder: 'gsk_...'    },
  { label: 'Anthropic Claude', provider: 'anthropic', placeholder: 'sk-ant-...' },
]

function formatReset(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
  } catch {
    return 'midnight UTC'
  }
}

export function ApiKeysSettings() {
  const [keyStatus, setKeyStatus]   = useState<KeyStatus>({})
  const [editing, setEditing]       = useState<Record<string, boolean>>({})
  const [values, setValues]         = useState<Record<string, string>>({})
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [usage, setUsage]           = useState<UsageData | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)

  useEffect(() => {
    fetchKeyStatus()
    fetchUsage()
  }, [])

  // Fetch which keys are valid (from user_api_keys via /api/settings/models)
  const fetchKeyStatus = async () => {
    try {
      const res  = await fetch('/api/settings/models')
      const json = await res.json()
      const map: KeyStatus = {}
      ;(json.keys ?? []).forEach((k: any) => { map[k.provider] = k.is_valid })
      setKeyStatus(map)
    } finally {
      setLoading(false)
    }
  }

  // Fetch today's system usage from billing table
  const fetchUsage = async () => {
    try {
      const res  = await fetch('/api/usage/today')
      const json = await res.json()
      if (!json.error) setUsage(json)
    } finally {
      setUsageLoading(false)
    }
  }

  // Validate and store the key via /api/settings/models/validate
  const handleSave = async (provider: string) => {
    const value = values[provider]
    if (!value) return

    setSaving(provider)
    try {
      const res = await fetch('/api/settings/models/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: value }),
      })
      const json = await res.json()

      if (json.valid) {
        setKeyStatus(prev => ({ ...prev, [provider]: true }))
        setEditing(prev => ({ ...prev, [provider]: false }))
        setValues(prev => ({ ...prev, [provider]: '' }))
        // Refresh usage in case they now have a BYOK key
        fetchUsage()
      } else {
        alert(formatErrorMessage(json.error ?? 'API key validation failed. Check the key and try again.'))
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <section style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '24px 20px',
      marginBottom: 20,
    }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ color: 'var(--accent)' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
          Cloud Model API Keys
        </div>
      </div>

      {/* Key inputs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        {PROVIDERS.map((item) => {
          const isStored  = keyStatus[item.provider]
          const isEditing = editing[item.provider] || !isStored

          return (
            <div key={item.provider} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{
                  fontSize: 11,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  letterSpacing: '0.05em',
                }}>
                  {item.label.toUpperCase()}
                </label>
                {isStored && !isEditing && (
                  <span style={{
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 9,
                    color: '#4ade80',
                    background: 'rgba(74,222,128,0.1)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}>
                    ✓ CONFIGURED
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                {isStored && !isEditing ? (
                  <div style={{
                    flex: 1,
                    background: 'var(--bg-3)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-4)',
                    fontSize: 13,
                    padding: '8px 12px',
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span>••••••••••••••••••••••••</span>
                    <button
                      onClick={() => setEditing(prev => ({ ...prev, [item.provider]: true }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: 10,
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        cursor: 'pointer',
                        padding: '0 4px',
                      }}
                    >
                      EDIT
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="password"
                      placeholder={item.placeholder}
                      value={values[item.provider] || ''}
                      onChange={(e) => setValues(prev => ({ ...prev, [item.provider]: e.target.value }))}
                      autoFocus={isEditing && isStored}
                      style={{
                        flex: 1,
                        background: 'var(--bg-3)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text)',
                        fontSize: 13,
                        padding: '8px 12px',
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        outline: 'none',
                      }}
                    />
                    {isStored && isEditing && (
                      <button
                        onClick={() => setEditing(prev => ({ ...prev, [item.provider]: false }))}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-3)',
                          fontSize: 10,
                          padding: '0 12px',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-dm-mono, monospace)',
                        }}
                      >
                        CANCEL
                      </button>
                    )}
                    <button
                      onClick={() => handleSave(item.provider)}
                      disabled={saving === item.provider || !values[item.provider]}
                      style={{
                        background: 'var(--bg-4)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-2)',
                        fontSize: 11,
                        padding: '0 16px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        opacity: (saving === item.provider || !values[item.provider]) ? 0.5 : 1,
                      }}
                    >
                      {saving === item.provider ? '...' : (isStored ? 'UPDATE' : 'SAVE')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* System Usage Meter */}
      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 16,
      }}>
        <div style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--text-4)',
          letterSpacing: '0.08em',
          marginBottom: 10,
        }}>
          DAILY FREE USAGE
        </div>

        {usageLoading ? (
          <div style={{ fontSize: 11, color: 'var(--text-4)' }}>Loading...</div>
        ) : usage?.hasUserKey ? (
          <div style={{ fontSize: 11, color: '#4ade80' }}>
            ✓ Using your API key — no system limit applies
          </div>
        ) : usage ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {usage.tokensUsed.toLocaleString()} / {usage.limit.toLocaleString()} tokens today
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                Resets {formatReset(usage.resetAt)}
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--bg-4)', borderRadius: 2, position: 'relative' }}>
              {(() => {
                const pct = Math.min((usage.tokensUsed / usage.limit) * 100, 100)
                const color = pct >= 90 ? '#f87171' : pct >= 75 ? '#fb923c' : 'var(--accent)'
                return (
                  <div style={{
                    position: 'absolute', left: 0, top: 0,
                    height: '100%',
                    width: `${pct}%`,
                    background: color,
                    borderRadius: 2,
                    transition: 'width 0.3s ease',
                  }} />
                )
              })()}
            </div>
            {usage.tokensUsed >= usage.limit && (
              <div style={{
                marginTop: 10,
                fontSize: 11,
                color: '#f87171',
                background: 'rgba(248,113,113,0.08)',
                border: '1px solid rgba(248,113,113,0.25)',
                borderRadius: 6,
                padding: '8px 12px',
                lineHeight: 1.5,
              }}>
                ⚠ Free usage limit reached. Add an API key above or wait until{' '}
                {formatReset(usage.resetAt)}.
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}
