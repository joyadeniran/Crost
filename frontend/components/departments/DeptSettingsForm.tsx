'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Department } from '@/types'

const AVAILABLE_TOOLS = [
  'web_search', 'send_email', 'post_social', 'read_crm', 'write_crm',
  'read_calendar', 'write_calendar', 'run_query', 'call_api', 'read_docs',
  'write_docs', 'create_document', 'send_message',
]

const MODEL_OPTIONS: { provider: Department['model_provider']; name: string; label: string }[] = [
  { provider: 'local',  name: 'gemma3:4b',         label: 'Gemma 3 4B (Local)' },
  { provider: 'local',  name: 'gemma3:12b',         label: 'Gemma 3 12B (Local)' },
  { provider: 'gemini', name: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash' },
  { provider: 'gemini', name: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro' },
  { provider: 'claude', name: 'claude-3-5-haiku',   label: 'Claude 3.5 Haiku' },
  { provider: 'claude', name: 'claude-3-5-sonnet',  label: 'Claude 3.5 Sonnet' },
  { provider: 'groq',   name: 'llama-3.3-70b',      label: 'Llama 3.3 70B (Groq)' },
]

interface Props {
  dept: Department
}

export function DeptSettingsForm({ dept }: Props) {
  const router = useRouter()
  const [persona, setPersona] = useState(dept.persona_prompt)
  const [toneOverride, setToneOverride] = useState(dept.tone_override ?? '')
  const [tools, setTools] = useState<string[]>(dept.tools as string[])
  const [capabilities, setCapabilities] = useState((dept.capabilities as string[]).join(', '))
  const [restrictions, setRestrictions] = useState((dept.restrictions as string[]).join(', '))
  const [modelKey, setModelKey] = useState(`${dept.model_provider}::${dept.model_name}`)
  
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [hasDraft, setHasDraft] = useState(false)

  // Load draft
  useEffect(() => {
    try {
      const d = localStorage.getItem(`crost-dept-draft-${dept.slug}`)
      if (d) {
        const p = JSON.parse(d)
        setPersona(p.persona ?? dept.persona_prompt)
        setToneOverride(p.toneOverride ?? dept.tone_override ?? '')
        setTools(p.tools ?? dept.tools as string[])
        setCapabilities(p.capabilities ?? (dept.capabilities as string[]).join(', '))
        setRestrictions(p.restrictions ?? (dept.restrictions as string[]).join(', '))
        setModelKey(p.modelKey ?? `${dept.model_provider}::${dept.model_name}`)
        setHasDraft(true)
      }
    } catch {}
  }, [dept.slug])

  // Save draft
  useEffect(() => {
    const draft = { persona, toneOverride, tools, capabilities, restrictions, modelKey }
    // Only save if it differs from the original dept props to avoid cluttering storage
    const isDefault = persona === dept.persona_prompt && 
                     toneOverride === (dept.tone_override ?? '') &&
                     JSON.stringify(tools) === JSON.stringify(dept.tools) &&
                     capabilities === (dept.capabilities as string[]).join(', ') &&
                     restrictions === (dept.restrictions as string[]).join(', ') &&
                     modelKey === `${dept.model_provider}::${dept.model_name}`
    
    if (!isDefault) {
      localStorage.setItem(`crost-dept-draft-${dept.slug}`, JSON.stringify(draft))
      setHasDraft(true)
    } else {
      localStorage.removeItem(`crost-dept-draft-${dept.slug}`)
      setHasDraft(false)
    }
  }, [persona, toneOverride, tools, capabilities, restrictions, modelKey, dept.slug])

  const discardDraft = () => {
    if (confirm('Discard all unsaved changes for this department?')) {
      setPersona(dept.persona_prompt)
      setToneOverride(dept.tone_override ?? '')
      setTools(dept.tools as string[])
      setCapabilities((dept.capabilities as string[]).join(', '))
      setRestrictions((dept.restrictions as string[]).join(', '))
      setModelKey(`${dept.model_provider}::${dept.model_name}`)
      localStorage.removeItem(`crost-dept-draft-${dept.slug}`)
      setHasDraft(false)
    }
  }

  const toggleTool = (tool: string) => {
    setTools(prev => prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool])
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)

    const selectedModel = MODEL_OPTIONS.find(m => `${m.provider}::${m.name}` === modelKey)
    const body: Record<string, unknown> = {
      persona_prompt: persona,
      tone_override: toneOverride.trim() || null,
      tools,
      capabilities: capabilities.split(',').map(s => s.trim()).filter(Boolean),
      restrictions: restrictions.split(',').map(s => s.trim()).filter(Boolean),
    }
    if (selectedModel) {
      body.model_provider = selectedModel.provider
      body.model_name = selectedModel.name
    }

    try {
      const res = await fetch(`/api/departments/${dept.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      
      localStorage.removeItem(`crost-dept-draft-${dept.slug}`)
      setHasDraft(false)
      
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDeprecate = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/departments/${dept.slug}`, { method: 'DELETE' })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Deprecation failed')
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Deprecation failed')
      setDeleting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-3)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--font-dm-sans, sans-serif)',
    fontSize: 13,
    padding: '8px 10px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-dm-mono, monospace)',
    fontSize: 10,
    color: 'var(--text-3)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '18px 20px',
    marginBottom: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  }

  return (
    <div style={{ maxWidth: 640 }}>

      {/* Persona */}
      <section style={sectionStyle}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>
          Agent Persona
        </div>
        {dept.activation_stage === 'active' && (
          <div style={{
            fontSize: 11, color: 'var(--amber)',
            background: 'rgba(255,179,71,0.08)',
            border: '1px solid rgba(255,179,71,0.2)',
            borderRadius: 6, padding: '6px 10px',
          }}>
            ⚠ Changing persona or tools will reset this department to Review stage.
          </div>
        )}
        <div>
          <label style={labelStyle}>Persona Prompt</label>
          <textarea
            value={persona}
            onChange={e => setPersona(e.target.value)}
            rows={6}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
          />
        </div>
        <div>
          <label style={labelStyle}>Tone Override (optional)</label>
          <input
            type="text"
            value={toneOverride}
            onChange={e => setToneOverride(e.target.value)}
            placeholder="e.g. concise and direct, avoid jargon"
            style={inputStyle}
          />
        </div>
      </section>

      {/* Model */}
      <section style={sectionStyle}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Model
        </div>
        <div>
          <label style={labelStyle}>Select Model</label>
          <select
            value={modelKey}
            onChange={e => setModelKey(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            {MODEL_OPTIONS.map(m => (
              <option key={`${m.provider}::${m.name}`} value={`${m.provider}::${m.name}`}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Tools */}
      <section style={sectionStyle}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Tools
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {AVAILABLE_TOOLS.map(tool => {
            const active = tools.includes(tool)
            return (
              <button
                key={tool}
                onClick={() => toggleTool(tool)}
                style={{
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  fontSize: 10,
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'var(--accent-dim)' : 'var(--bg-3)',
                  color: active ? 'var(--accent)' : 'var(--text-3)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {active ? '✓ ' : ''}{tool.replace(/_/g, ' ')}
              </button>
            )
          })}
        </div>
      </section>

      {/* Capabilities & Restrictions */}
      <section style={sectionStyle}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Capabilities &amp; Restrictions
        </div>
        <div>
          <label style={labelStyle}>Capabilities (comma-separated)</label>
          <input
            type="text"
            value={capabilities}
            onChange={e => setCapabilities(e.target.value)}
            placeholder="e.g. draft_emails, read_crm"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Restrictions (comma-separated)</label>
          <input
            type="text"
            value={restrictions}
            onChange={e => setRestrictions(e.target.value)}
            placeholder="e.g. no_financial_decisions, no_public_posts"
            style={inputStyle}
          />
        </div>
      </section>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary-crost"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {hasDraft && !saving && (
          <button
            onClick={discardDraft}
            style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-3)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            DISCARD CHANGES
          </button>
        )}
        {success && (
          <span style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
            ✓ Saved
          </span>
        )}
        {error && (
          <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>
        )}
      </div>

      {/* Danger Zone */}
      {dept.activation_stage !== 'deprecated' && (
        <section style={{
          background: 'rgba(255,77,109,0.04)',
          border: '1px solid rgba(255,77,109,0.2)',
          borderRadius: 'var(--radius)',
          padding: '18px 20px',
        }}>
          <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>
            Danger Zone
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
            Deprecating this department will set it to inactive, auto-reject all pending approvals, and pause its Orc persona. This cannot be undone without re-activating.
          </p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                fontFamily: 'var(--font-dm-mono, monospace)',
                fontSize: 11,
                padding: '6px 16px',
                borderRadius: 8,
                border: '1px solid rgba(255,77,109,0.4)',
                background: 'transparent',
                color: 'var(--red)',
                cursor: 'pointer',
              }}
            >
              Deprecate Department
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Are you sure?</span>
              <button
                onClick={handleDeprecate}
                disabled={deleting}
                style={{
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  fontSize: 11,
                  padding: '6px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--red)',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? 'Deprecating…' : 'Yes, deprecate'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                style={{
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  fontSize: 11,
                  padding: '6px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              {deleteError && <span style={{ fontSize: 12, color: 'var(--red)' }}>{deleteError}</span>}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
