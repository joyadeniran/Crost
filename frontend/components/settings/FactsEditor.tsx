'use client'

// Company facts: what Orc and the departments may state as figures. The founder adds, replaces and
// retires them here (or confirms ones Orc proposes in chat). Replacing a key keeps the old value as history.

import { useEffect, useState } from 'react'

type Fact = { id: string; key: string; value: string; as_of: string | null; source: string | null; volatile: boolean; prohibited: boolean }

const box: React.CSSProperties = { background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px' }
const input: React.CSSProperties = { width: '100%', fontSize: 13, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }

export function FactsEditor() {
  const [facts, setFacts] = useState<Fact[] | null>(null)
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [asOf, setAsOf] = useState('')
  const [never, setNever] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    fetch('/api/facts')
      .then((r) => r.json())
      .then((j) => { if (live) j?.success ? setFacts(j.data.facts) : setError('Could not load facts.') })
      .catch(() => live && setError('Could not load facts.'))
    return () => { live = false }
  }, [version])

  const add = async () => {
    setBusy(true)
    setError(null)
    const fact = never
      ? { key: key || `never_${Date.now().toString(36)}`, value, prohibited: true }
      : { key, value, as_of: asOf || undefined, source: 'founder, in settings' }
    const r = await fetch('/api/facts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facts: [fact] }) })
    const j = await r.json().catch(() => null)
    setBusy(false)
    if (!j?.success) return setError(j?.error ?? 'Could not save.')
    setKey(''); setValue(''); setAsOf(''); setNever(false)
    setVersion((v) => v + 1)
  }

  const remove = async (id: string) => {
    const r = await fetch(`/api/facts/${id}`, { method: 'DELETE' })
    if (!r.ok) return setError('Could not remove it.')
    setVersion((v) => v + 1)
  }

  return (
    <section style={box}>
      <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
        Company facts
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
        The only source Orc and the departments use for figures. Deliverables flag any number that is not here.
        Moving figures (revenue, users, runway) need a date and go stale after six months.
      </p>

      {facts === null ? (
        <p style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading…</p>
      ) : facts.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 12 }}>None yet. Tell Orc a figure in chat, or add one below.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {facts.map((f) => (
            <li key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: f.prohibited ? 'var(--danger, #b42318)' : 'var(--text-3)', fontFamily: 'var(--font-mono, monospace)' }}>
                {f.prohibited ? 'never claim' : f.key}
              </span>
              <span style={{ color: 'var(--text)', flex: 1, minWidth: 120 }}>{f.value}</span>
              {f.as_of && <span style={{ color: 'var(--text-4)' }}>as of {f.as_of}</span>}
              <button className="link-btn" onClick={() => remove(f.id)} aria-label={`Remove ${f.key}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {!never && <input style={input} placeholder="What it is, e.g. monthly revenue usd" value={key} onChange={(e) => setKey(e.target.value)} maxLength={60} />}
        <input style={input} placeholder={never ? 'The claim never to make, e.g. "$77K MRR"' : 'Value, exactly as it should be stated'} value={value} onChange={(e) => setValue(e.target.value)} maxLength={500} />
        {!never && <input style={input} type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="True as of" />}
        <label style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} /> This must never be claimed
        </label>
        <div>
          <button className="btn-primary-crost" onClick={add} disabled={busy || !value.trim() || (!never && !key.trim())}>
            {busy ? 'Saving…' : 'Add fact'}
          </button>
        </div>
        {error && <p style={{ fontSize: 12, color: 'var(--danger, #b42318)' }}>{error}</p>}
      </div>
    </section>
  )
}
