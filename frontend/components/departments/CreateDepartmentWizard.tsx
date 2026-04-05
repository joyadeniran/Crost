'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { AvailableTool } from '@/types'

interface Props {
  onClose: () => void
}

const ICON_OPTIONS = [
  { value: 'briefcase', label: '💼' },
  { value: 'code-2',    label: '💻' },
  { value: 'megaphone', label: '📣' },
  { value: 'handshake', label: '🤝' },
  { value: 'bar-chart-2', label: '📊' },
  { value: 'settings-2',  label: '⚙️' },
  { value: 'flask',     label: '🧪' },
  { value: 'globe',     label: '🌐' },
  { value: 'users',     label: '👥' },
  { value: 'zap',       label: '⚡' },
]

const COLOR_OPTIONS = [
  '#6366f1', '#0ea5e9', '#f97316', '#22c55e',
  '#a855f7', '#64748b', '#ec4899', '#eab308',
]

const MODEL_OPTIONS = [
  { value: 'local/gemma3',      label: 'Gemma 3 12B (Local)' },
  { value: 'local/gemma3-lite', label: 'Gemma 3 4B (Local, fast)' },
  { value: 'local/llama3',      label: 'Llama 3 (Local, code)' },
  { value: 'local/mistral',     label: 'Mistral (Local, fallback)' },
  { value: 'cloud/gemini-pro',  label: 'Gemini Pro (Cloud)' },
  { value: 'cloud/claude-sonnet', label: 'Claude Sonnet (Cloud)' },
  { value: 'cloud/groq-llama',  label: 'Groq Llama (Cloud, fast)' },
]

const PRESET_CAPABILITIES = [
  'code_review', 'draft_prs', 'write_docs', 'technical_research',
  'write_content', 'draft_social_posts', 'competitor_research', 'email_copy',
  'draft_outreach', 'contact_research', 'pipeline_tracking', 'meeting_prep',
  'financial_modelling', 'budget_tracking', 'investor_materials', 'runway_analysis',
  'task_coordination', 'draft_contracts', 'write_sops', 'inter_dept_coordination',
]

function toSlug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function CreateDepartmentWizard({ onClose }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tools, setTools] = useState<AvailableTool[]>([])

  // Form state
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [icon, setIcon] = useState('briefcase')
  const [color, setColor] = useState('#6366f1')
  const [personaPrompt, setPersonaPrompt] = useState('')
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [customCap, setCustomCap] = useState('')
  const [selectedTools, setSelectedTools] = useState<string[]>([])
  const [modelName, setModelName] = useState('local/gemma3')

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugManual && name) setSlug(toSlug(name))
  }, [name, slugManual])

  // Fetch available tools
  useEffect(() => {
    fetch('/api/tools')
      .then((r) => r.json())
      .then((j) => setTools(j.data ?? []))
      .catch(() => {})
  }, [])

  const toggleCap = (cap: string) => {
    setCapabilities((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    )
  }

  const addCustomCap = () => {
    const val = customCap.trim().toLowerCase().replace(/\s+/g, '_')
    if (val && !capabilities.includes(val)) {
      setCapabilities((prev) => [...prev, val])
    }
    setCustomCap('')
  }

  const toggleTool = (id: string) => {
    setSelectedTools((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const provider = modelName.startsWith('cloud/') ? modelName.split('/')[1] : 'local'
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          persona_prompt: personaPrompt,
          model_provider: provider === 'gemini' || provider === 'claude' || provider === 'groq' ? provider : 'local',
          model_name: modelName,
          tools: selectedTools,
          capabilities,
          restrictions: [],
          icon: ICON_OPTIONS.find((o) => o.value === icon)?.label ?? '💼',
          color,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong.')
        return
      }
      onClose()
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return name.length >= 2 && slug.length >= 2
    if (step === 2) return personaPrompt.length >= 50 && capabilities.length > 0
    if (step === 3) return true
    return true
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-bold text-white">New Department</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Step {step} of 4</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-xl leading-none transition-colors"
          >
            ×
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 px-6 py-3">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-indigo-500' : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-4 min-h-[320px]">

          {/* Step 1: Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Department name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Legal, Research, Customer Success"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white px-3 py-2.5 text-sm
                             placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">URL slug</label>
                <input
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugManual(true) }}
                  placeholder="e.g. legal"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white px-3 py-2.5 text-sm
                             placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
                <p className="text-xs text-zinc-500 mt-1">/dashboard/departments/{slug || '…'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Icon</label>
                <div className="flex gap-2 flex-wrap">
                  {ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setIcon(opt.value)}
                      className={`h-10 w-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                        icon === opt.value ? 'bg-indigo-600 ring-2 ring-indigo-400' : 'bg-zinc-800 hover:bg-zinc-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Color</label>
                <div className="flex gap-2">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`h-7 w-7 rounded-full transition-transform ${
                        color === c ? 'scale-125 ring-2 ring-white' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Persona */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">
                  Persona prompt
                  <span className="ml-2 text-xs text-zinc-500">({personaPrompt.length}/50 min)</span>
                </label>
                <textarea
                  value={personaPrompt}
                  onChange={(e) => setPersonaPrompt(e.target.value)}
                  rows={5}
                  placeholder="You are the [Department] Head. Describe responsibilities, rules, and what this agent should always or never do…"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white px-3 py-2.5 text-sm
                             placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Capabilities</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {PRESET_CAPABILITIES.map((cap) => (
                    <button
                      key={cap}
                      onClick={() => toggleCap(cap)}
                      className={`text-xs rounded-lg px-2.5 py-1 transition-colors ${
                        capabilities.includes(cap)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {cap.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={customCap}
                    onChange={(e) => setCustomCap(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomCap()}
                    placeholder="Custom capability…"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 text-white px-3 py-1.5 text-xs
                               placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <button
                    onClick={addCustomCap}
                    className="rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs px-3 py-1.5 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Tools & Model */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Tools</label>
                {tools.length === 0 ? (
                  <p className="text-xs text-zinc-500">No tools configured yet. Add them in Settings.</p>
                ) : (
                  <div className="space-y-2">
                    {tools.map((tool) => (
                      <label
                        key={tool.id}
                        className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                          selectedTools.includes(tool.id)
                            ? 'border-indigo-500 bg-indigo-950'
                            : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                        } ${!tool.is_configured ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTools.includes(tool.id)}
                          onChange={() => tool.is_configured && toggleTool(tool.id)}
                          className="accent-indigo-500"
                          disabled={!tool.is_configured}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{tool.label}</p>
                          <p className="text-xs text-zinc-500 truncate">{tool.description}</p>
                        </div>
                        <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          tool.risk_level === 'critical' ? 'bg-red-900 text-red-300' :
                          tool.risk_level === 'high'     ? 'bg-orange-900 text-orange-300' :
                          tool.risk_level === 'medium'   ? 'bg-yellow-900 text-yellow-300' :
                          'bg-green-900 text-green-300'
                        }`}>
                          {tool.risk_level}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Model</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 text-white px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 items-center justify-center rounded-xl text-2xl shrink-0"
                  style={{ backgroundColor: color + '33', color }}
                >
                  {ICON_OPTIONS.find((o) => o.value === icon)?.label ?? '💼'}
                </div>
                <div>
                  <p className="font-bold text-white text-lg">{name}</p>
                  <p className="text-sm text-zinc-500 font-mono">/{slug}</p>
                </div>
              </div>
              <div className="rounded-lg border border-zinc-700 bg-zinc-800 p-3 text-sm text-zinc-300 max-h-28 overflow-y-auto">
                <p className="whitespace-pre-wrap leading-relaxed">{personaPrompt}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((c) => (
                  <span key={c} className="text-xs bg-indigo-900/50 text-indigo-300 rounded px-2 py-0.5">
                    {c.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Model</span>
                <span className="text-zinc-300">{MODEL_OPTIONS.find((m) => m.value === modelName)?.label}</span>
              </div>
              {selectedTools.length > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Tools</span>
                  <span className="text-zinc-300">{selectedTools.join(', ')}</span>
                </div>
              )}
              {error && (
                <p className="text-sm text-red-400 rounded-lg bg-red-900/30 px-3 py-2">{error}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-4 border-t border-zinc-800">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              ← Back
            </button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-5 py-2
                         transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || !canProceed()}
              className="rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium px-5 py-2
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Department'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
