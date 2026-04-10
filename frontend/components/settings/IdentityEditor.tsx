'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  initialFounder: string
  initialCompany: string
}

export function IdentityEditor({ initialFounder, initialCompany }: Props) {
  const [founder, setFounder] = useState(initialFounder)
  const [company, setCompany] = useState(initialCompany)
  const [isEditing, setIsEditing] = useState(!initialFounder && !initialCompany)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      // We save three keys: founder_name, company_name, and the composite local_identity for the AI
      const ops = [
        { key: 'founder_name', value: founder.trim() },
        { key: 'company_name', value: company.trim() },
        { key: 'local_identity', value: `${founder.trim()} (${company.trim()})` }
      ]

      for (const op of ops) {
        const res = await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(op),
        })
        if (!res.ok) {
          const json = await res.json()
          throw new Error(json.error || `Failed to save ${op.key}`)
        }
      }

      setSuccess(true)
      setIsEditing(false)
      setTimeout(() => setSuccess(false), 3000)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '18px 20px',
      marginBottom: 16,
    }}>
      <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
        Founder Identity
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
        Your name and your company name. This provides context for your AI departments.
      </p>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={founder}
              onChange={e => setFounder(e.target.value)}
              placeholder="Your Name (e.g. John Doe)"
              style={{
                flex: 1,
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: 13,
                padding: '8px 10px',
                outline: 'none',
              }}
            />
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Company Name (e.g. Acme Corp)"
              style={{
                flex: 1,
                background: 'var(--bg-3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text)',
                fontSize: 13,
                padding: '8px 10px',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setFounder(initialFounder)
                setCompany(initialCompany)
                setIsEditing(false)
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-3)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !founder.trim() || !company.trim()}
              className="btn-primary-crost"
              style={{ opacity: saving ? 0.6 : 1, padding: '6px 16px', fontSize: 12 }}
            >
              {saving ? 'Saving…' : 'Save Identity'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg-3)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>
            <span style={{ fontWeight: 600 }}>{founder}</span>
            <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>@</span>
            <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{company}</span>
          </div>
          <button
            onClick={() => setIsEditing(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Update
          </button>
        </div>
      )}

      {success && (
        <p style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)', marginTop: 8 }}>
          ✓ Identity synchronized
        </p>
      )}
      {error && (
        <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{error}</p>
      )}
    </section>
  )
}
