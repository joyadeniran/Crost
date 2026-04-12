'use client'

// ModelAssignmentForm: assigns LLM models to system roles (reasoning/execution/utility).
// RULE: This component handles model routing ONLY.
//       API key management belongs exclusively in ApiKeysSettings.

import { useState, useEffect } from 'react'

const ROLES = ['reasoning', 'execution', 'utility'] as const
const ROLE_COPY: Record<(typeof ROLES)[number], string> = {
  reasoning: 'Used by Orc for planning, synthesis, and harder strategic calls.',
  execution: 'Used by departments and worker tasks for primary task delivery.',
  utility: 'Used for lighter support work such as formatting and fast helper tasks.',
}

// Canonical provider slugs (LiteLLM prefix convention)
const PROVIDERS = ['anthropic', 'gemini', 'groq']

const PRESETS = ['budget', 'fast', 'premium']

const MODEL_MAP: Record<string, Record<string, string>> = {
  'anthropic': {
    'budget':  'anthropic/claude-sonnet-4.6',
    'fast':    'anthropic/claude-sonnet-4.6',
    'premium': 'anthropic/claude-opus-4.6',
  },
  'gemini': {
    'budget':  'gemini/gemini-2.5-flash',
    'fast':    'gemini/gemini-2.5-flash',
    'premium': 'gemini/gemini-2.5-flash',
  },
  'groq': {
    'budget':  'groq/llama-3.3-70b-versatile',
    'fast':    'groq/llama-3.3-70b-versatile',
    'premium': 'groq/llama-3.3-70b-versatile',
  },
}

// Human-readable labels for canonical provider slugs
const PROVIDER_LABELS: Record<string, string> = {
  'anthropic': 'Anthropic',
  'gemini':    'Gemini',
  'groq':      'Groq',
}

export function ModelAssignmentForm() {
  const [assignments, setAssignments] = useState<Record<string, any>>({})
  const [loading, setLoading]         = useState(true)
  const [savingKey, setSavingKey]     = useState<string | null>(null)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res  = await fetch('/api/settings/models')
      const data = await res.json()

      const assignmentMap: Record<string, any> = {}
      ;(data.assignments ?? []).forEach((a: any) => {
        assignmentMap[a.role] = a
      })
      setAssignments(assignmentMap)
    } finally {
      setLoading(false)
    }
  }

  const saveAssignment = async (role: string, provider: string, preset: string) => {
    const model = MODEL_MAP[provider]?.[preset]
    if (!model) return

    setSavingKey(`${role}:${provider}:${preset}`)
    setError(null)
    try {
      const res = await fetch('/api/settings/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, model_name: model, provider, preset_config: preset }),
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || 'Failed to save assignment')
      }

      setAssignments(prev => ({
        ...prev,
        [role]: { role, model_name: model, provider, preset_config: preset },
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assignment')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return <div style={{ fontSize: 13, color: 'var(--text-3)', padding: 20 }}>Loading model assignments...</div>
  }

  return (
    <section style={{ padding: '20px 20px 22px' }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
          Model Assignments by Role
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>
          Choose which provider and performance tier powers each system role. API keys are managed separately above.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {ROLES.map((role) => {
          const current = assignments[role]

          return (
            <section
              key={role}
              style={{
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '14px 14px 12px',
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 14, color: 'var(--text)', textTransform: 'capitalize' }}>
                    {role}
                  </div>
                  {current && (
                    <span style={{
                      fontFamily: 'var(--font-dm-mono, monospace)',
                      fontSize: 9,
                      color: 'var(--accent)',
                      background: 'rgba(0, 224, 184, 0.08)',
                      border: '1px solid rgba(0, 224, 184, 0.18)',
                      borderRadius: 999,
                      padding: '3px 8px',
                      letterSpacing: '0.05em',
                    }}>
                      ACTIVE
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, margin: '4px 0 0' }}>
                  {ROLE_COPY[role]}
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                {PROVIDERS.flatMap((provider) =>
                  PRESETS.map((preset) => {
                    const isActive = current?.provider === provider && current?.preset_config === preset
                    const isSaving = savingKey === `${role}:${provider}:${preset}`

                    return (
                      <button
                        key={`${role}-${provider}-${preset}`}
                        onClick={() => saveAssignment(role, provider, preset)}
                        disabled={!!savingKey}
                        style={{
                          padding: '10px 10px 9px',
                          borderRadius: 10,
                          border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                          background: isActive ? 'rgba(0, 224, 184, 0.08)' : 'var(--bg-2)',
                          color: isActive ? 'var(--text)' : 'var(--text-2)',
                          cursor: savingKey ? 'wait' : 'pointer',
                          opacity: isSaving ? 0.7 : 1,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: isActive ? 'var(--accent)' : 'var(--text-3)', marginBottom: 5 }}>
                          {PROVIDER_LABELS[provider].toUpperCase()}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>
                          {isSaving ? 'Saving…' : preset}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {current && (
                <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)', lineHeight: 1.5 }}>
                  Current: {PROVIDER_LABELS[current.provider] ?? current.provider} / {current.preset_config} / {current.model_name}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {error && (
        <div style={{
          marginTop: 14,
          fontSize: 11,
          color: 'var(--red)',
          background: 'rgba(248,113,113,0.08)',
          border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 8,
          padding: '9px 12px',
          lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}
    </section>
  )
}
