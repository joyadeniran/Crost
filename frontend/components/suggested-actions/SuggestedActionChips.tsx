'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase-browser'

interface SuggestedActionRow {
  id: string
  action_slug: string
  label: string
  reasoning: string
  risk_level: string
  status: string
  required_inputs: string[]
  required_tool: string | null
  payload: Record<string, unknown>
}

type ChipState = 'idle' | 'needs_input' | 'loading' | 'done' | 'approval' | 'error'

interface Props {
  entityType: 'artifact' | 'mission_report' | 'memo'
  entityId: string
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChipIcon({ slug }: { slug: string }) {
  switch (slug) {
    case 'send_to_email':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
          <polyline points="22,6 12,13 2,6"/>
        </svg>
      )
    case 'save_to_kb':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
        </svg>
      )
    case 'add_to_memo':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      )
    case 'make_changes':
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      )
    default:
      return (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      )
  }
}

// ─── Inline input label ───────────────────────────────────────────────────────

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    destination_email: 'Recipient email address',
  }
  return labels[field] || field.replace(/_/g, ' ')
}

// ─── Single chip ──────────────────────────────────────────────────────────────

function ActionChip({ action, onDone }: { action: SuggestedActionRow; onDone: () => void }) {
  const router = useRouter()
  const [chipState, setChipState] = useState<ChipState>(
    action.status === 'approved' ? 'approval' : 'idle'
  )
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [message, setMessage] = useState(
    action.status === 'approved' ? 'Awaiting your approval in Inbox' : ''
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])

  useEffect(() => {
    if (chipState === 'needs_input') inputRef.current?.focus()
  }, [chipState])

  // Poll DB every 3 s while waiting for an approval to be executed
  useEffect(() => {
    if (chipState !== 'approval') return
    const interval = setInterval(async () => {
      try {
        const { data } = await supabaseClient
          .from('suggested_actions')
          .select('status')
          .eq('id', action.id)
          .single()
        if (data?.status === 'completed') {
          clearInterval(interval)
          setChipState('done')
          setMessage('Action Executed')
          onDoneRef.current()
        } else if (data?.status === 'failed') {
          clearInterval(interval)
          setChipState('error')
          setMessage('Execution failed')
        }
      } catch { /* ignore transient poll errors */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [chipState, action.id])

  const isCompleted = action.status === 'completed'
  const isDone = chipState === 'done' || isCompleted

  async function execute(extraInputs: Record<string, string> = {}) {
    setChipState('loading')
    setMessage('')

    try {
      const res = await fetch(`/api/suggested-actions/${action.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: { ...inputs, ...extraInputs } }),
      })
      const data = await res.json()

      if (data.needs_input) {
        setChipState('needs_input')
        return
      }

      if (data.redirect) {
        setChipState('done')
        setMessage('Opening War Room…')
        const url = data.goal_id ? `/dashboard?goal=${data.goal_id}` : '/dashboard'
        router.push(url)
        return
      }

      if (data.requires_approval) {
        setChipState('approval')
        setMessage('Awaiting your approval in Inbox')
        // Poll will detect when approval executes and call onDone then
        return
      }

      if (data.error) {
        setChipState('error')
        setMessage(data.error)
        return
      }

      // Success
      setChipState('done')
      setMessage(data.result?.message || 'Done')
      setTimeout(onDone, 1800)
    } catch {
      setChipState('error')
      setMessage('Something went wrong. Try again.')
    }
  }

  // Colour scheme per risk level
  const riskColour = action.risk_level === 'medium' ? '#facc15' : 'var(--accent)'
  const riskBg = action.risk_level === 'medium' ? 'rgba(250,204,21,0.08)' : 'rgba(0,212,170,0.08)'
  const riskBorder = action.risk_level === 'medium' ? 'rgba(250,204,21,0.2)' : 'rgba(0,212,170,0.2)'

  const baseStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 20,
    background: isDone ? 'rgba(34,197,94,0.08)' : chipState === 'error' ? 'rgba(239,68,68,0.08)' : riskBg,
    border: `1px solid ${isDone ? 'rgba(34,197,94,0.25)' : chipState === 'error' ? 'rgba(239,68,68,0.25)' : riskBorder}`,
    color: isDone ? '#4ade80' : chipState === 'error' ? '#f87171' : riskColour,
    fontSize: 12,
    fontWeight: 500,
    fontFamily: 'var(--font-dm-sans, sans-serif)',
    cursor: chipState === 'loading' || isDone ? 'default' : 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  }

  // ── Needs input: render inline email field ────────────────────────────────
  if (chipState === 'needs_input') {
    const field = (action.required_inputs || [])[0] || 'value'
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 4px 4px 10px',
        borderRadius: 20,
        background: riskBg,
        border: `1px solid ${riskBorder}`,
        flexWrap: 'nowrap',
      }}>
        <ChipIcon slug={action.action_slug} />
        <span style={{ fontSize: 11, color: riskColour, fontWeight: 500, whiteSpace: 'nowrap' }}>
          {fieldLabel(field)}:
        </span>
        <input
          ref={inputRef}
          type={field.includes('email') ? 'email' : 'text'}
          placeholder={field.includes('email') ? 'you@example.com' : 'Enter value…'}
          value={inputs[field] || ''}
          onChange={e => setInputs(prev => ({ ...prev, [field]: e.target.value }))}
          onKeyDown={e => {
            if (e.key === 'Enter' && inputs[field]?.trim()) execute()
            if (e.key === 'Escape') setChipState('idle')
          }}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 12,
            width: 160,
            fontFamily: 'var(--font-dm-sans, sans-serif)',
          }}
        />
        <button
          onClick={() => inputs[field]?.trim() && execute()}
          disabled={!inputs[field]?.trim()}
          style={{
            padding: '4px 10px',
            borderRadius: 14,
            background: inputs[field]?.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            border: 'none',
            color: inputs[field]?.trim() ? 'var(--bg)' : 'var(--text-4)',
            fontSize: 11,
            fontWeight: 600,
            cursor: inputs[field]?.trim() ? 'pointer' : 'default',
            fontFamily: 'var(--font-dm-mono, monospace)',
            flexShrink: 0,
          }}
        >
          Send ↵
        </button>
        <button
          onClick={() => setChipState('idle')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-4)', fontSize: 14, padding: '0 6px', lineHeight: 1,
          }}
          title="Cancel"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <button
      style={baseStyle}
      onClick={() => {
        if (chipState === 'loading' || isDone) return
        if ((action.required_inputs || []).length > 0) {
          setChipState('needs_input')
        } else {
          execute()
        }
      }}
      title={chipState === 'error' ? message : action.reasoning}
      onMouseEnter={e => {
        if (!isDone && chipState !== 'loading') {
          e.currentTarget.style.background = action.risk_level === 'medium'
            ? 'rgba(250,204,21,0.15)'
            : 'rgba(0,212,170,0.15)'
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = isDone
          ? 'rgba(34,197,94,0.08)'
          : chipState === 'error'
            ? 'rgba(239,68,68,0.08)'
            : riskBg
      }}
    >
      {chipState === 'loading' ? (
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          border: `1.5px solid ${riskColour}`,
          borderTopColor: 'transparent',
          display: 'inline-block',
          animation: 'spin 0.7s linear infinite',
        }} />
      ) : isDone ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : chipState === 'error' ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      ) : (
        <ChipIcon slug={action.action_slug} />
      )}
      <span>
        {chipState === 'loading' ? 'Working…'
          : chipState === 'approval' ? 'Pending approval'
          : chipState === 'error' ? 'Retry'
          : isDone && message ? message
          : action.label}
      </span>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SuggestedActionChips({ entityType, entityId }: Props) {
  const [actions, setActions] = useState<SuggestedActionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchActions() {
      try {
        const { data, error } = await supabaseClient
          .from('suggested_actions')
          .select('id, action_slug, label, reasoning, risk_level, status, required_inputs, required_tool, payload')
          .eq('source_entity_type', entityType)
          .eq('source_entity_id', entityId)
          .in('status', ['suggested', 'tapped', 'approved', 'completed'])
          .order('created_at', { ascending: true })
          .limit(3)

        if (!error && data) setActions(data)
      } catch (err) {
        console.error('[SuggestedActionChips] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchActions()
  }, [entityType, entityId])

  function handleDone(id: string) {
    setActions(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'completed' } : a)
    )
  }

  if (loading || actions.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
        fontFamily: 'var(--font-dm-mono, monospace)',
      }}>
        Suggested Next Steps
      </div>

      {/* Inject spinner keyframe once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map(action => (
          <ActionChip
            key={action.id}
            action={action}
            onDone={() => handleDone(action.id)}
          />
        ))}
      </div>
    </div>
  )
}
