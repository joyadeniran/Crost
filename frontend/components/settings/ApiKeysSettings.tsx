'use client'

import { useState, useEffect } from 'react'

interface ApiKeyPresence {
  [key: string]: boolean
}

interface ApiKeyItem {
  id: string
  label: string
  provider: string
  placeholder: string
}

const PROVIDERS: ApiKeyItem[] = [
  { id: 'gemini_api_key', label: 'Google Gemini', provider: 'google', placeholder: 'AIza...' },
  { id: 'groq_api_key',   label: 'Groq Cloud',   provider: 'groq',   placeholder: 'gsk_...' },
  { id: 'claude_api_key', label: 'Anthropic Claude', provider: 'anthropic', placeholder: 'sk-ant-...' },
]

export function ApiKeysSettings() {
  const [presence, setPresence] = useState<ApiKeyPresence>({})
  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    fetchPresence()
  }, [])

  const fetchPresence = async () => {
    try {
      const res = await fetch('/api/config/secret-presence')
      const json = await res.json()
      if (json.presence) setPresence(json.presence)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (id: string) => {
    const value = values[id]
    if (!value) return

    setSaving(id)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: id, value })
      })

      if (res.ok) {
        setPresence(prev => ({ ...prev, [id]: true }))
        setEditing(prev => ({ ...prev, [id]: false }))
        setValues(prev => ({ ...prev, [id]: '' }))
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {PROVIDERS.map((provider) => {
          const isStored = presence[provider.id]
          const isEditing = editing[provider.id] || !isStored

          return (
            <div key={provider.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)', letterSpacing: '0.05em' }}>
                  {provider.label.toUpperCase()}
                </label>
                {isStored && !isEditing && (
                  <span style={{ 
                    fontFamily: 'var(--font-dm-mono, monospace)', 
                    fontSize: 9, 
                    color: '#4ade80',
                    background: 'rgba(74, 222, 128, 0.1)',
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
                    justifyContent: 'space-between'
                  }}>
                    <span>••••••••••••••••••••••••</span>
                    <button
                      onClick={() => setEditing(prev => ({ ...prev, [provider.id]: true }))}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent)',
                        fontSize: 10,
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        cursor: 'pointer',
                        padding: '0 4px'
                      }}
                    >
                      EDIT
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      type="password"
                      placeholder={provider.placeholder}
                      value={values[provider.id] || ''}
                      onChange={(e) => setValues(prev => ({ ...prev, [provider.id]: e.target.value }))}
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
                        onClick={() => setEditing(prev => ({ ...prev, [provider.id]: false }))}
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
                      onClick={() => handleSave(provider.id)}
                      disabled={saving === provider.id || !values[provider.id]}
                      style={{
                        background: 'var(--bg-4)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-2)',
                        fontSize: 11,
                        padding: '0 16px',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        opacity: (saving === provider.id || !values[provider.id]) ? 0.5 : 1
                      }}
                    >
                      {saving === provider.id ? '...' : (isStored ? 'UPDATE' : 'SAVE')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
