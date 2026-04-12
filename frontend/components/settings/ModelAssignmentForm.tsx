'use client'

// ModelAssignmentForm: assigns LLM models to system roles (reasoning/execution/utility).
// RULE: This component handles model routing ONLY.
//       API key management belongs exclusively in ApiKeysSettings.

import { useState, useEffect } from 'react'

const ROLES = ['reasoning', 'execution', 'utility']

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

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    const res  = await fetch('/api/settings/models')
    const data = await res.json()

    const assignmentMap: Record<string, any> = {}
    ;(data.assignments ?? []).forEach((a: any) => {
      assignmentMap[a.role] = a
    })
    setAssignments(assignmentMap)
    setLoading(false)
  }

  const saveAssignment = async (role: string, provider: string, preset: string) => {
    const model = MODEL_MAP[provider]?.[preset]
    if (!model) return

    const res = await fetch('/api/settings/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, model_name: model, provider, preset_config: preset }),
    })

    if (res.ok) {
      setAssignments(prev => ({
        ...prev,
        [role]: { role, model_name: model, provider, preset_config: preset },
      }))
    }
  }

  if (loading) return <div style={{ fontSize: 13, color: 'var(--text-3)', padding: 16 }}>Loading...</div>

  return (
    <div className="space-y-8 p-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Model Assignments by Role</h2>
        <p className="text-sm text-gray-500 mb-4">
          Choose which provider and quality tier handles each system role.
          Add API keys in the <strong>Cloud Model API Keys</strong> section above.
        </p>
        <div className="space-y-4">
          {ROLES.map(role => {
            const current = assignments[role]

            return (
              <div key={role} className="border rounded p-4">
                <h3 className="font-medium mb-2 capitalize">{role}</h3>
                <div className="flex flex-wrap gap-2">
                  {PROVIDERS.map(provider =>
                    PRESETS.map(preset => (
                      <button
                        key={`${provider}-${preset}`}
                        onClick={() => saveAssignment(role, provider, preset)}
                        className={`px-3 py-1 rounded text-sm ${
                          current?.provider === provider && current?.preset_config === preset
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300'
                        }`}
                      >
                        {PROVIDER_LABELS[provider]}-{preset}
                      </button>
                    ))
                  )}
                </div>
                {current && (
                  <p className="text-xs text-gray-600 mt-2">
                    Current: {PROVIDER_LABELS[current.provider] ?? current.provider} / {current.preset_config} — <span className="font-mono">{current.model_name}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
