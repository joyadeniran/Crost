'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  initialFounder: string
  initialCompany: string
  initialFounderIdentity: string
  initialCompanyIdentity: string
  initialAssistantIdentity: string
}

export function IdentityEditor({
  initialFounder,
  initialCompany,
  initialFounderIdentity,
  initialCompanyIdentity,
  initialAssistantIdentity,
}: Props) {
  const [founder, setFounder] = useState(initialFounder)
  const [company, setCompany] = useState(initialCompany)
  const [founderIdentity, setFounderIdentity] = useState(initialFounderIdentity)
  const [companyIdentity, setCompanyIdentity] = useState(initialCompanyIdentity)
  const [assistantIdentity, setAssistantIdentity] = useState(initialAssistantIdentity)
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
      const ops = [
        { key: 'founder_name', value: founder.trim() },
        { key: 'company_name', value: company.trim() },
        { key: 'founder_identity', value: founderIdentity.trim() },
        { key: 'company_identity', value: companyIdentity.trim() },
        { key: 'assistant_identity', value: assistantIdentity.trim() },
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
        Identity Layers
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
        Keep founder context, company context, and Orc&apos;s own identity separate so the system stays grounded.
      </p>

      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              type="text"
              value={founder}
              onChange={(e) => setFounder(e.target.value)}
              placeholder="Founder Name (e.g. Joy A.)"
              style={{
                flex: 1,
                minWidth: 220,
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
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Company Name (e.g. Supplya)"
              style={{
                flex: 1,
                minWidth: 220,
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

          <textarea
            value={founderIdentity}
            onChange={(e) => setFounderIdentity(e.target.value)}
            placeholder="Founder identity context for the AI"
            rows={3}
            style={{
              width: '100%',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 12px',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />

          <textarea
            value={companyIdentity}
            onChange={(e) => setCompanyIdentity(e.target.value)}
            placeholder="Company identity context for the AI"
            rows={3}
            style={{
              width: '100%',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 12px',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />

          <textarea
            value={assistantIdentity}
            onChange={(e) => setAssistantIdentity(e.target.value)}
            placeholder="Assistant identity for Orc and the operating system"
            rows={3}
            style={{
              width: '100%',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 12px',
              outline: 'none',
              resize: 'vertical',
              lineHeight: 1.5,
            }}
          />

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setFounder(initialFounder)
                setCompany(initialCompany)
                setFounderIdentity(initialFounderIdentity)
                setCompanyIdentity(initialCompanyIdentity)
                setAssistantIdentity(initialAssistantIdentity)
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
              disabled={saving || !founder.trim() || !company.trim() || !assistantIdentity.trim()}
              className="btn-primary-crost"
              style={{ opacity: saving ? 0.6 : 1, padding: '6px 16px', fontSize: 12 }}
            >
              {saving ? 'Saving…' : 'Save Identity'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--bg-3)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 10 }}>
              <span style={{ fontWeight: 600 }}>{founder}</span>
              <span style={{ color: 'var(--text-3)', margin: '0 8px' }}>@</span>
              <span style={{ fontWeight: 600, color: 'var(--blue)' }}>{company}</span>
            </div>
            <div style={{ display: 'grid', gap: 8, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              <div><span style={{ color: 'var(--text-4)', fontSize: 10, letterSpacing: '0.08em' }}>FOUNDER</span><br />{founderIdentity}</div>
              <div><span style={{ color: 'var(--text-4)', fontSize: 10, letterSpacing: '0.08em' }}>COMPANY</span><br />{companyIdentity}</div>
              <div><span style={{ color: 'var(--text-4)', fontSize: 10, letterSpacing: '0.08em' }}>ASSISTANT</span><br />{assistantIdentity}</div>
            </div>
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
