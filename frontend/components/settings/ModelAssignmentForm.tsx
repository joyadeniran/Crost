'use client'

import { useState, useEffect } from 'react'

const ROLES = ['reasoning', 'execution', 'utility']
const PROVIDERS = ['claude', 'gemini', 'groq']
const PRESETS = ['budget', 'fast', 'premium']

const MODEL_MAP: Record<string, Record<string, string>> = {
  'claude': {
    'budget': 'claude-haiku-4.5',
    'fast': 'claude-sonnet-4.6',
    'premium': 'claude-opus-4.6'
  },
  'gemini': {
    'budget': 'gemini-1.5-flash',
    'fast': 'gemini-3.1-pro',
    'premium': 'gemini-3.1-pro'
  },
  'groq': {
    'budget': 'mixtral-8x7b',
    'fast': 'llama-3.3-70b-versatile',
    'premium': 'llama-3.3-70b-versatile'
  }
}

export function ModelAssignmentForm() {
  const [assignments, setAssignments] = useState<Record<string, any>>({})
  const [keys, setKeys] = useState<Record<string, boolean>>({})
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('claude')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    const res = await fetch('/api/settings/models')
    const data = await res.json()

    const assignmentMap: Record<string, any> = {}
    data.assignments.forEach((a: any) => {
      assignmentMap[a.role] = a
    })
    setAssignments(assignmentMap)

    const keyMap: Record<string, boolean> = {}
    data.keys.forEach((k: any) => {
      keyMap[k.provider] = k.is_valid
    })
    setKeys(keyMap)
    setLoading(false)
  }

  const validateAndStoreKey = async () => {
    if (!apiKeyInput.trim()) return

    setSaving(true)
    const res = await fetch('/api/settings/models/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: selectedProvider,
        api_key: apiKeyInput
      })
    })

    const result = await res.json()
    if (result.valid) {
      setKeys(prev => ({ ...prev, [selectedProvider]: true }))
      setApiKeyInput('')
    } else {
      alert('API key validation failed')
    }
    setSaving(false)
  }

  const saveAssignment = async (role: string, provider: string, preset: string) => {
    const model = MODEL_MAP[provider]?.[preset]

    const res = await fetch('/api/settings/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        model_name: model,
        provider,
        preset_config: preset
      })
    })

    if (res.ok) {
      setAssignments(prev => ({
        ...prev,
        [role]: { role, model_name: model, provider, preset_config: preset }
      }))
    }
  }

  if (loading) return <div>Loading...</div>

  return (
    <div className="space-y-8 p-6">
      <div className="border-b pb-6">
        <h2 className="text-lg font-semibold mb-4">Add API Keys</h2>
        <div className="flex gap-2">
          <select
            value={selectedProvider}
            onChange={e => setSelectedProvider(e.target.value)}
            className="border rounded px-3 py-2"
          >
            {PROVIDERS.map(p => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
          <input
            type="password"
            placeholder="Paste API key"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            className="border rounded px-3 py-2 flex-1"
          />
          <button
            onClick={validateAndStoreKey}
            disabled={saving}
            className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
          >
            {saving ? 'Validating...' : 'Add'}
          </button>
        </div>
        <div className="mt-2 text-sm">
          {Object.entries(keys).map(([provider, valid]) => (
            <div key={provider} className={valid ? 'text-green-600' : 'text-gray-400'}>
              {provider.charAt(0).toUpperCase() + provider.slice(1)}: {valid ? '✓ Valid' : '○ Not added'}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">Model Assignments by Role</h2>
        <div className="space-y-4">
          {ROLES.map(role => {
            const current = assignments[role]
            const availableProviders = PROVIDERS.filter(p => keys[p])

            return (
              <div key={role} className="border rounded p-4">
                <h3 className="font-medium mb-2 capitalize">{role}</h3>
                {availableProviders.length === 0 ? (
                  <p className="text-gray-500 text-sm">Add API keys first</p>
                ) : (
                  <div className="flex gap-2">
                    {availableProviders.map(provider =>
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
                          {provider.slice(0, 1)}-{preset}
                        </button>
                      ))
                    )}
                  </div>
                )}
                {current && (
                  <p className="text-xs text-gray-600 mt-2">
                    Current: {current.provider} / {current.preset_config}
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
