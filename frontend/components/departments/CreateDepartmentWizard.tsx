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
  { value: 'local/gemma3',      label: 'Gemma 3 4B (Local)' },
  { value: 'local/llama3',      label: 'Llama 3 8B (Local, code)' },
  { value: 'gemini/gemini-1.5-pro',  label: 'Gemini 1.5 Pro (Cloud, Smart)' },
  { value: 'anthropic/claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Cloud, Premium)' },
  { value: 'groq/llama3-70b-8192',  label: 'Groq Llama 3 70B (Cloud, Fast)' },
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

  // Load from draft
  useEffect(() => {
    try {
      const d = localStorage.getItem('crost-wizard-draft')
      if (d) {
        const p = JSON.parse(d)
        if (p.step) setStep(p.step)
        if (p.name) setName(p.name)
        if (p.slug) setSlug(p.slug)
        if (p.slugManual !== undefined) setSlugManual(p.slugManual)
        if (p.icon) setIcon(p.icon)
        if (p.color) setColor(p.color)
        if (p.personaPrompt) setPersonaPrompt(p.personaPrompt)
        if (p.capabilities) setCapabilities(p.capabilities)
        if (p.customCap !== undefined) setCustomCap(p.customCap)
        if (p.selectedTools) setSelectedTools(p.selectedTools)
        if (p.modelName) setModelName(p.modelName)
      }
    } catch {}
  }, [])

  // Save to draft
  useEffect(() => {
    localStorage.setItem('crost-wizard-draft', JSON.stringify({
      step, name, slug, slugManual, icon, color, personaPrompt,
      capabilities, customCap, selectedTools, modelName
    }))
  }, [step, name, slug, slugManual, icon, color, personaPrompt, capabilities, customCap, selectedTools, modelName])

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
      const provider = modelName.includes('/') ? modelName.split('/')[0] : 'local'
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          persona_prompt: personaPrompt,
          model_provider: provider,
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
      localStorage.removeItem('crost-wizard-draft')
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--font-dm-sans, sans-serif)',
    fontSize: 13,
    padding: '10px 12px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: 680,
      margin: '0 auto',
      padding: '40px 20px',
      minHeight: 'calc(100vh - 100px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 32
    }}>
      <div style={{
        width: '100%',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        boxShadow: '0 4px 30px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-2)'
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-syne, Syne)',
              fontWeight: 700,
              fontSize: 18,
              color: 'var(--text)',
              marginBottom: 4
            }}>
              New Department
            </h2>
            <p style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-3)',
              letterSpacing: '0.04em'
            }}>
              STEP {step} OF 4
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 24,
              cursor: 'pointer',
              lineHeight: 1,
              padding: 0
            }}
          >
            ×
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, padding: '16px 24px' }}>
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 2,
                background: s <= step ? 'var(--accent)' : 'var(--bg-3)',
                transition: 'background 0.3s ease'
              }}
            />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '0 24px 24px', minHeight: 340 }}>

          {/* Step 1: Identity */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>
                  Department Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Legal, Research, Customer Success"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>
                  URL Slug
                </label>
                <input
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugManual(true) }}
                  placeholder="e.g. legal"
                  style={{ ...inputStyle, fontFamily: 'var(--font-dm-mono, monospace)' }}
                />
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  /dashboard/departments/{slug || '…'}
                </p>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 10 }}>
                  Icon
                </label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setIcon(opt.value)}
                      style={{
                        height: 46,
                        width: 46,
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 22,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: icon === opt.value ? 'var(--accent)' : 'var(--bg-3)',
                        border: icon === opt.value ? '1px solid rgba(255,255,255,0.2)' : '1px solid var(--border)',
                        color: '#fff',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 10 }}>
                  Brand Color
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{
                        backgroundColor: c,
                        height: 32,
                        width: 32,
                        borderRadius: '50%',
                        border: color === c ? '2px solid white' : '2px solid transparent',
                        transform: color === c ? 'scale(1.15)' : 'scale(1)',
                        transition: 'all 0.2s ease',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Persona */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>
                  <span>Persona Prompt</span>
                  <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: personaPrompt.length < 50 ? 'var(--red)' : 'var(--text-3)' }}>
                    {personaPrompt.length}/50 min
                  </span>
                </label>
                <textarea
                  value={personaPrompt}
                  onChange={(e) => setPersonaPrompt(e.target.value)}
                  rows={6}
                  placeholder="You are the [Department] Head. Describe responsibilities, rules, and what this agent should always or never do…"
                  style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 10 }}>
                  Core Capabilities
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {PRESET_CAPABILITIES.map((cap) => (
                    <button
                      key={cap}
                      onClick={() => toggleCap(cap)}
                      style={{
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        fontSize: 11,
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: capabilities.includes(cap) ? 'var(--accent)' : 'var(--bg-3)',
                        color: capabilities.includes(cap) ? '#000' : 'var(--text-2)',
                        border: '1px solid',
                        borderColor: capabilities.includes(cap) ? 'transparent' : 'var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      {cap.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    value={customCap}
                    onChange={(e) => setCustomCap(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomCap()}
                    placeholder="add_custom_capability..."
                    style={{ ...inputStyle, padding: '8px 12px' }}
                  />
                  <button
                    onClick={addCustomCap}
                    style={{
                      background: 'var(--bg-3)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0 16px',
                      fontSize: 13,
                      cursor: 'pointer'
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Tools & Model */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 12 }}>
                  Select Tools
                </label>
                {tools.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No tools configured yet. Add them in Settings.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {tools.map((tool) => {
                      const isSelected = selectedTools.includes(tool.id)
                      const isConf = tool.is_configured
                      return (
                        <label
                          key={tool.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            background: isSelected ? 'rgba(0, 212, 170, 0.05)' : 'var(--bg-3)',
                            border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-sm)',
                            padding: '12px 16px',
                            cursor: isConf ? 'pointer' : 'not-allowed',
                            opacity: isConf ? 1 : 0.5,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => isConf && toggleTool(tool.id)}
                            disabled={!isConf}
                            style={{ accentColor: 'var(--accent)', cursor: 'inherit', width: 16, height: 16 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{tool.label}</p>
                            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {tool.description}
                            </p>
                          </div>
                          <span style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-dm-mono, monospace)',
                            padding: '3px 6px',
                            borderRadius: 4,
                            background: tool.risk_level === 'critical' ? 'var(--red)' : 
                                        tool.risk_level === 'high' ? 'var(--amber)' :
                                        tool.risk_level === 'medium' ? 'var(--amber)' : 'var(--bg-2)',
                            color: tool.risk_level !== 'low' ? '#000' : 'var(--text-3)'
                          }}>
                            {tool.risk_level}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 8 }}>
                  Assign Model
                </label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 4: Final Review */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div style={{ 
                background: 'var(--bg-3)',
                padding: '16px',
                borderRadius: 'var(--radius-sm)',
                borderLeft: '4px solid var(--accent)',
                fontFamily: 'var(--font-dm-mono, monospace)',
                fontSize: 10,
                color: 'var(--accent)',
                letterSpacing: '0.04em'
              }}>
                PROTOCOL: AGENT_INSTANTIATION_v1.0
                <br/>STATUS: AWAITING_FOUNDER_COMMIT
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 64,
                  height: 64,
                  borderRadius: 16,
                  backgroundColor: color + '20',
                  color: color,
                  fontSize: 28,
                  flexShrink: 0,
                  border: `1px solid ${color}40`
                }}>
                  {ICON_OPTIONS.find((o) => o.value === icon)?.label ?? '💼'}
                </div>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-syne, Syne)', fontSize: 24, fontWeight: 700, margin: '0 0 2px', color: 'var(--text)' }}>
                    {name}
                  </h3>
                  <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 13, color: 'var(--text-3)', margin: 0 }}>
                    PROJECT_SLUG: {slug}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{
                  background: 'var(--bg-3)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '16px',
                  fontSize: 13,
                  color: 'var(--text-2)',
                  lineHeight: 1.6,
                }}>
                  <span style={{ fontSize: 10, color: 'var(--text-4)', display: 'block', marginBottom: 8, fontFamily: 'var(--font-dm-mono, monospace)' }}>MISSION_DIRECTIVE</span>
                  {personaPrompt}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {capabilities.map((c) => (
                    <span key={c} style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-dm-mono, monospace)',
                      background: 'rgba(0, 212, 170, 0.08)',
                      color: 'var(--accent)',
                      border: '1px solid rgba(0, 212, 170, 0.2)',
                      padding: '4px 8px',
                      borderRadius: 4
                    }}>
                      {c.toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: 20, 
                padding: '16px', 
                background: 'var(--bg-2)', 
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)' 
              }}>
                 <div>
                   <span style={{ fontSize: 9, color: 'var(--text-4)', fontWeight: 600, fontFamily: 'var(--font-dm-mono, monospace)' }}>ENGINE</span>
                   <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                      {MODEL_OPTIONS.find((m) => m.value === modelName)?.label}
                   </div>
                 </div>
                 <div>
                   <span style={{ fontSize: 9, color: 'var(--text-4)', fontWeight: 600, fontFamily: 'var(--font-dm-mono, monospace)' }}>TOOLS_INTEGRATED</span>
                   <div style={{ fontSize: 13, fontWeight: 500, marginTop: 4 }}>
                      {selectedTools.length} MODULES
                   </div>
                 </div>
              </div>

              {error && (
                <div style={{ 
                  background: 'rgba(239, 68, 68, 0.1)', 
                  color: 'var(--red)', 
                  fontSize: 12, 
                  padding: '12px 16px', 
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  fontFamily: 'var(--font-dm-mono, monospace)'
                }}>
                  PROTOCOL_ERROR: {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-2)'
        }}>
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-3)',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              ← Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="btn-primary-crost"
              style={{ opacity: canProceed() ? 1 : 0.5 }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting || !canProceed()}
              className="btn-primary-crost"
              style={{ 
                opacity: (submitting || !canProceed()) ? 0.5 : 1,
                background: '#00d4aa',
                color: '#000',
              }}
            >
              {submitting ? 'Creating...' : 'Create Department'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
