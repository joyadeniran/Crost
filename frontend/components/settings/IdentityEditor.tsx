'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  initial: string
}

export function IdentityEditor({ initial }: Props) {
  const [value, setValue] = useState(initial)
  const [isEditing, setIsEditing] = useState(!initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'local_identity', value: value.trim() }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
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
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
        Your name or company name. Shown in the sidebar and used as context for your AI departments.
      </p>

      {isEditing ? (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="Your name or company"
            autoFocus
            style={{
              flex: 1,
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontFamily: 'var(--font-dm-sans, sans-serif)',
              fontSize: 13,
              padding: '8px 10px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSave}
            disabled={saving || !value.trim()}
            className="btn-primary-crost"
            style={{ flexShrink: 0, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {initial && !saving && (
             <button
               onClick={() => {
                 setValue(initial)
                 setIsEditing(false)
               }}
               style={{
                 background: 'transparent',
                 border: '1px solid var(--border)',
                 color: 'var(--text-3)',
                 padding: '8px 12px',
                 borderRadius: 'var(--radius-sm)',
                 fontSize: 13,
                 cursor: 'pointer'
               }}
             >
               Cancel
             </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'var(--bg-3)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          <div style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>
            {value}
          </div>
          <button
            onClick={() => setIsEditing(true)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Edit
          </button>
        </div>
      )}

      {success && (
        <p style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)', marginTop: 8 }}>
          ✓ Identity updated
        </p>
      )}
      {error && (
        <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 8 }}>{error}</p>
      )}
    </section>
  )
}
