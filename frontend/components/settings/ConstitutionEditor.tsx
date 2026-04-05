'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  constitution: string
}

// Core clauses that cannot be removed — we derive them from the first N lines of the constitution
const CORE_CLAUSE_COUNT = 8

export function ConstitutionEditor({ constitution }: Props) {
  const clean = constitution.replace(/^"|"$/g, '').replace(/\\n/g, '\n')
  const allLines = clean.split('\n').filter(l => l.trim())
  const coreLines = allLines.slice(0, CORE_CLAUSE_COUNT)
  const extraLines = allLines.slice(CORE_CLAUSE_COUNT)

  const [extras, setExtras] = useState<string[]>(extraLines)
  const [newClause, setNewClause] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const addClause = () => {
    if (!newClause.trim()) return
    setExtras(prev => [...prev, newClause.trim()])
    setNewClause('')
  }

  const removeClause = (idx: number) => {
    setExtras(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    const combined = [...coreLines, ...extras].join('\n')
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'agent_constitution', value: combined }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '18px 20px',
    marginBottom: 16,
  }

  return (
    <section style={sectionStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
          Agent Constitution
        </div>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--accent)',
          background: 'var(--accent-dim)',
          padding: '2px 8px',
          borderRadius: 8,
        }}>
          {CORE_CLAUSE_COUNT} CORE + {extras.length} CUSTOM
        </span>
      </div>

      {/* Core clauses — read-only */}
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
          marginBottom: 8,
        }}>
          CORE CLAUSES — READ ONLY
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {coreLines.map((line, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 10,
              fontSize: 12,
              color: 'var(--text-2)',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '7px 12px',
              lineHeight: 1.5,
            }}>
              <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* Custom clauses */}
      {extras.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
            marginBottom: 8,
          }}>
            CUSTOM CLAUSES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {extras.map((line, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                fontSize: 12,
                color: 'var(--text-2)',
                background: 'rgba(0,212,170,0.04)',
                border: '1px solid rgba(0,212,170,0.15)',
                borderRadius: 6,
                padding: '7px 12px',
                lineHeight: 1.5,
              }}>
                <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>
                  {String(CORE_CLAUSE_COUNT + i + 1).padStart(2, '0')}
                </span>
                <span style={{ flex: 1 }}>{line}</span>
                <button
                  onClick={() => removeClause(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--red)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0,
                    flexShrink: 0,
                    lineHeight: 1,
                  }}
                  title="Remove clause"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add new clause */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <input
          type="text"
          value={newClause}
          onChange={e => setNewClause(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addClause()}
          placeholder="Add a custom clause…"
          style={{
            flex: 1,
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 12,
            padding: '7px 10px',
            outline: 'none',
          }}
        />
        <button
          onClick={addClause}
          disabled={!newClause.trim()}
          style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            padding: '7px 14px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-3)',
            color: 'var(--text-2)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          + Add
        </button>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary-crost"
          style={{ opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save Constitution'}
        </button>
        {success && (
          <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
            ✓ Saved
          </span>
        )}
        {error && (
          <span style={{ fontSize: 11, color: 'var(--red)' }}>{error}</span>
        )}
      </div>
    </section>
  )
}
