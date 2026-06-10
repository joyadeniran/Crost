'use client'

import { toast } from '@/components/ui/toaster'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'

// components/war-room/WarRoom.tsx
// The War Room: goal input + live plan card + per-task approve/reject.
// This is the core of the founder→orchestrator→worker loop.
import { supabaseClient } from '@/lib/supabase-browser'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCrostStore } from '@/lib/store'
import type { Goal, OrchestratorTask, RiskLevel, Department, GoalTaskStatus, CalendarEvent } from '@/types'
import type { PrepSuggestion } from '@/lib/calendar-prep'
import { parseInput, getActivePrefix } from '@/lib/hooks/useInputParser'
import { ChatCommandMenu } from '@/components/chat/ChatCommandMenu'
import { SuggestedActionChips } from '@/components/suggested-actions/SuggestedActionChips'
import { formatErrorMessage, resolveIcon } from '@/lib/utils'
import { getRandomProcessingMessage, getProcessingMessageByIndex } from '@/lib/processing-copy'

// ─── Orc mode config ──────────────────────────────────────────────────────────

type OrcResponseMode = 'assistant' | 'clarify' | 'quick_plan' | 'full_plan' | 'direct_action' | 'command' | 'escalate'

const MODE_META: Record<OrcResponseMode, { label: string; color: string; bg: string; border: string; description: string }> = {
  assistant:     { label: 'ASSISTANT',     color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)', description: 'Direct answer from context' },
  clarify:       { label: 'CLARIFYING',    color: '#facc15', bg: 'rgba(234,179,8,0.10)',   border: 'rgba(234,179,8,0.25)',   description: 'A few questions before planning' },
  quick_plan:    { label: 'QUICK PLAN',    color: '#4ade80', bg: 'rgba(34,197,94,0.10)',   border: 'rgba(34,197,94,0.25)',   description: 'Routine goal — 3-5 tasks' },
  full_plan:     { label: 'FULL PLAN',     color: '#818cf8', bg: 'rgba(99,102,241,0.10)',  border: 'rgba(99,102,241,0.25)',  description: 'Strategic multi-department analysis' },
  direct_action: { label: 'DIRECT ACTION', color: '#38bdf8', bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.25)', description: 'Single action with HITL approval' },
  command:       { label: 'COMMAND',       color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.25)', description: 'System command' },
  escalate:      { label: 'ESCALATE',      color: '#fb923c', bg: 'rgba(249,115,22,0.10)',  border: 'rgba(249,115,22,0.25)',  description: 'Capability gap — alternatives offered' },
}

function OrcModeBadge({ mode, confidence }: { mode: string; confidence?: number }) {
  const meta = MODE_META[mode as OrcResponseMode]
  if (!meta) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={meta.description}>
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: meta.bg,
        color: meta.color,
        border: `1px solid ${meta.border}`,
        borderRadius: 4,
        padding: '2px 7px',
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 9,
        letterSpacing: '0.07em',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: meta.color, display: 'inline-block', flexShrink: 0 }} />
        {meta.label}
      </span>
      {typeof confidence === 'number' && confidence < 0.75 && (
        <span style={{ fontSize: 9, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  )
}

function OrcReasoningPanel({ decision }: {
  decision?: { mode: string; confidence: number; reasoning: string; risk_notes: string[] } | null
}) {
  const [open, setOpen] = useState(false)
  if (!decision) return null
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--text-4)',
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
        {open ? 'HIDE ORC\'S REASONING' : 'SHOW ORC\'S REASONING'}
      </button>
      {open && (
        <div style={{
          marginTop: 8,
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 11,
          fontFamily: 'var(--font-dm-sans, sans-serif)',
          color: 'var(--text-3)',
          lineHeight: 1.5,
        }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--text-4)', letterSpacing: '0.07em' }}>CLASSIFICATION · </span>
            <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.07em' }}>{decision.mode.toUpperCase()} ({Math.round(decision.confidence * 100)}% confidence)</span>
          </div>
          <div style={{ marginBottom: decision.risk_notes?.length > 0 ? 8 : 0 }}>{decision.reasoning}</div>
          {decision.risk_notes?.length > 0 && (
            <div>
              {decision.risk_notes.map((note, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 4 }}>
                  <span style={{ color: '#fb923c', fontSize: 10, flexShrink: 0 }}>⚠</span>
                  <span style={{ fontSize: 11 }}>{note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Risk colours ─────────────────────────────────────────────────────────────
const RISK_COLOURS: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  low:      { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  medium:   { bg: 'rgba(234,179,8,0.12)',  text: '#facc15', border: 'rgba(234,179,8,0.3)' },
  high:     { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  critical: { bg: 'rgba(239,68,68,0.12)',  text: '#f87171', border: 'rgba(239,68,68,0.3)' },
}

// Default fallback if dept not found in store
const DEFAULT_DEPT_COLOUR = '#6366f1'
const DEFAULT_DEPT_ICON = '🏢'


// ─── CalendarPrepPanel ────────────────────────────────────────────────────────

function CalendarPrepPanel({
  suggestions,
  onPrefill,
  onDismiss,
}: {
  suggestions: PrepSuggestion[]
  onPrefill: (prompt: string) => void
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  if (suggestions.length === 0) return null

  const EVENT_TYPE_EMOJI: Record<string, string> = {
    investor_meeting: '💼',
    customer_call: '📞',
    board_meeting: '🏛',
    conference: '🎤',
    deadline: '🔴',
    other: '📅',
  }

  return (
    <div style={{
      border: '1px solid rgba(99,102,241,0.25)',
      borderRadius: 'var(--radius)',
      marginBottom: 16,
      overflow: 'hidden',
      background: 'rgba(99,102,241,0.04)',
    }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', cursor: 'pointer',
          borderBottom: expanded ? '1px solid rgba(99,102,241,0.15)' : 'none',
        }}
      >
        <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 13, color: 'var(--foreground)', fontWeight: 600 }}>
          📅 {suggestions.length === 1
            ? `Upcoming: ${suggestions[0].event.title} (${suggestions[0].daysUntil === 0 ? 'today' : suggestions[0].daysUntil === 1 ? 'tomorrow' : `in ${suggestions[0].daysUntil} days`})`
            : `${suggestions.length} upcoming events — prep suggestions ready`}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
          <button
            onClick={e => { e.stopPropagation(); onDismiss() }}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', fontSize: 15, padding: 0, lineHeight: 1 }}
            title="Dismiss"
          >×</button>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {suggestions.map(({ event, daysUntil, checklist }) => (
            <div key={event.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span>{EVENT_TYPE_EMOJI[event.type] ?? '📅'}</span>
                <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                  {event.title}
                </span>
                <span style={{
                  fontSize: 11, padding: '2px 7px', borderRadius: 9999,
                  background: daysUntil <= 1 ? 'rgba(239,68,68,0.15)' : daysUntil <= 3 ? 'rgba(234,179,8,0.15)' : 'rgba(99,102,241,0.12)',
                  color: daysUntil <= 1 ? '#f87171' : daysUntil <= 3 ? '#ca8a04' : '#818cf8',
                  fontFamily: 'var(--font-dm-mono, monospace)',
                }}>
                  {daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil}d`}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {checklist.filter(item => item.goalPrompt).map(item => (
                  <button
                    key={item.label}
                    onClick={() => onPrefill(item.goalPrompt!)}
                    style={{
                      background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(99,102,241,0.2)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 12,
                      color: '#818cf8',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-dm-sans, sans-serif)',
                      transition: 'background 0.15s',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── GoalInput ────────────────────────────────────────────────────────────────

function GoalInput({
  onSubmit,
  isLoading,
  hasActiveGoal,
  departments,
  prefillSignal,
}: {
  onSubmit: (goal: string) => void
  isLoading: boolean
  hasActiveGoal: boolean
  departments: Department[]
  prefillSignal?: { value: string; ts: number }
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (prefillSignal?.value) {
      setValue(prefillSignal.value)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [prefillSignal])
  const [menuPrefix, setMenuPrefix] = useState<'@' | '/' | null>(null)
  const [menuQuery, setMenuQuery] = useState('')
  const [menuIndex, setMenuIndex] = useState(0)

  useEffect(() => {
    try {
      const d = localStorage.getItem('crost-draft-goal')
      if (d) setValue(d)
    } catch {}
  }, [])

  useEffect(() => {
    if (value.trim()) localStorage.setItem('crost-draft-goal', value)
    else localStorage.removeItem('crost-draft-goal')
  }, [value])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value
    setValue(newVal)
    const { prefix, query } = getActivePrefix(newVal, e.target.selectionStart ?? newVal.length)
    setMenuPrefix(prefix)
    setMenuQuery(query)
    setMenuIndex(0)
  }

  const handleMenuSelect = (completion: string) => {
    const cursorPos = inputRef.current?.selectionStart ?? value.length
    const before = value.slice(0, cursorPos)
    const after = value.slice(cursorPos)
    const triggerMatch = before.match(/(^|\s)([@/][a-zA-Z0-9_.-]*)$/)
    if (triggerMatch) {
      const triggerStart = before.length - triggerMatch[2].length
      const newVal = before.slice(0, triggerStart) + completion + after
      setValue(newVal)
      setTimeout(() => {
        if (inputRef.current) {
          const pos = triggerStart + completion.length
          inputRef.current.setSelectionRange(pos, pos)
          inputRef.current.focus()
        }
      }, 0)
    } else {
      setValue(value + completion)
    }
    setMenuPrefix(null)
    setMenuQuery('')
  }

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSubmit(trimmed)
    setValue('')
    setMenuPrefix(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuPrefix) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMenuIndex(i => i + 1); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMenuIndex(i => Math.max(0, i - 1)); return }
      if (e.key === 'Escape')    { e.preventDefault(); setMenuPrefix(null); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="goal-input-container" style={{ padding: '0', overflow: 'visible', position: 'relative' }}>
      {/* Header Area */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 10, 
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(255,255,255,0.01)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 7, height: 7,
            borderRadius: '50%',
            background: isLoading ? 'var(--amber)' : 'var(--accent)',
            boxShadow: isLoading ? '0 0 10px var(--amber)' : '0 0 10px var(--accent)',
            flexShrink: 0,
            animation: isLoading ? 'pulse 1.5s infinite' : undefined,
          }} />
          <span style={{
            fontFamily: 'var(--font-syne, sans-serif)',
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            War Room
          </span>
        </div>

        {!isLoading && (
          <div style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 12
          }}>
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-4)',
              letterSpacing: '0.02em',
              background: 'var(--bg-3)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>@</span> dept
            </span>
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-4)',
              letterSpacing: '0.02em',
              background: 'var(--bg-3)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>/</span> tool
            </span>
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-3)',
              opacity: 0.8
            }}>
              ⌘ ↵
            </span>
          </div>
        )}
      </div>

      <div style={{ padding: '16px', position: 'relative' }}>
        {menuPrefix && (
          <ChatCommandMenu
            prefix={menuPrefix}
            query={menuQuery}
            departments={departments}
            selectedIndex={menuIndex}
            onSelect={handleMenuSelect}
            onClose={() => setMenuPrefix(null)}
          />
        )}

        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="Tell your company what to do… (@ dept · / tool)"
          rows={2}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 15,
            resize: 'none',
            lineHeight: 1.6,
            opacity: isLoading ? 0.5 : 1,
            boxSizing: 'border-box',
            padding: '0',
            marginBottom: '12px'
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || isLoading}
            className="btn-primary-crost"
            style={{ 
              opacity: value.trim() && !isLoading ? 1 : 0.4,
              padding: '6px 18px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.03em',
              boxShadow: value.trim() && !isLoading ? '0 4px 15px rgba(0, 212, 170, 0.2)' : 'none'
            }}
          >
            {isLoading ? 'PLANNING…' : (hasActiveGoal && !value.trim()) ? 'NEW GOAL' : 'DISPATCH'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CommandThread ─────────────────────────────────────────────────────────────

type InlineMessage = {
  id: string
  type: 'dept' | 'tool'
  label: string
  input: string
  response?: string
  isLoading: boolean
  // Populated after completion so CommandThread can show mission report chips
  goal_id?: string
  artifact_id?: string
  // Approval state — set when dept returns approval_requested: true
  approvalPending?: boolean
  approvalDecision?: 'approved' | 'rejected'
  approvalId?: string
  approvalActionLabel?: string
  approvalActionType?: string
  approvalContext?: string
  approvalRiskLevel?: string
  approvalPayload?: Record<string, any>
  approvalDeptName?: string
  approvalError?: string
  approvalExecutionError?: string
  approvalExecuted?: boolean
}

const COMMAND_MESSAGES_STORAGE_KEY = 'crost-war-room-pending-approvals'

// Polls for the mission report memo created by runOrcReport, then shows chips.
// Only mounts when a goal_id is available and the response has loaded.
function DeferredMissionReportChips({ goalId }: { goalId: string }) {
  const [reportId, setReportId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 10 // poll for up to ~30 s

    async function poll() {
      if (cancelled || attempts >= MAX_ATTEMPTS) return
      attempts++
      try {
        const { data } = await supabaseClient
          .from('company_memos')
          .select('id')
          .eq('goal_id', goalId)
          .or('title.ilike.[Mission Report]%,title.ilike.[ORC REPORT]%')
          .maybeSingle()
        if (data?.id) {
          if (!cancelled) setReportId(data.id)
          return
        }
      } catch { /* ignore */ }
      setTimeout(poll, 3000)
    }
    poll()
    return () => { cancelled = true }
  }, [goalId])

  if (!reportId) return null
  return <SuggestedActionChips entityType="mission_report" entityId={reportId} />
}

// Inline approve/reject card — shown instead of raw JSON when approval_requested
function ApprovalCard({
  msg,
  onDecide,
  onSkip,
}: {
  msg: InlineMessage
  onDecide: (msgId: string, decision: 'approved' | 'rejected') => Promise<void>
  onSkip: (msgId: string) => void
}) {
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null)
  const [expanded, setExpanded] = useState(false)

  const handle = async (decision: 'approved' | 'rejected') => {
    if (deciding) return
    setDeciding(decision)
    await onDecide(msg.id, decision)
    setDeciding(null)
  }

  const riskColour = msg.approvalRiskLevel === 'critical' ? '#f87171'
    : msg.approvalRiskLevel === 'high' ? '#fb923c'
    : msg.approvalRiskLevel === 'medium' ? '#facc15'
    : '#4ade80'

  if (msg.approvalDecision) {
    const isFailed = !!msg.approvalExecutionError
    return (
      <div style={{ marginTop: 8 }}>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 11,
          fontWeight: 700,
          color: msg.approvalDecision === 'approved'
            ? (isFailed ? '#f87171' : '#4ade80')
            : '#f87171',
          letterSpacing: '0.06em',
        }}>
          {msg.approvalDecision === 'approved'
            ? (isFailed ? '✗ EXECUTION FAILED' : msg.approvalExecuted ? '✓ ACTION EXECUTED' : '✓ APPROVED — ACTION EXECUTING')
            : '✗ REJECTED'}
        </span>
        {isFailed && (
          <div style={{ fontSize: 11, color: '#f87171', opacity: 0.85, marginTop: 6, lineHeight: 1.45 }}>
            {formatErrorMessage(msg.approvalExecutionError)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 8,
      background: 'rgba(250,204,21,0.05)',
      border: '1px solid rgba(250,204,21,0.2)',
      borderRadius: 8,
      padding: '12px 14px',
    }}>
      {/* Status banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>⏸</span>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: '#facc15',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}>
          AWAITING YOUR APPROVAL
        </span>
        {msg.approvalRiskLevel && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 9,
            color: riskColour,
            background: `${riskColour}18`,
            border: `1px solid ${riskColour}44`,
            borderRadius: 4,
            padding: '1px 6px',
            textTransform: 'uppercase',
          }}>
            {msg.approvalRiskLevel}
          </span>
        )}
      </div>

      {/* Action description */}
      <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>
        {msg.approvalActionLabel}
      </div>

      {msg.approvalContext && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 8, fontStyle: 'italic' }}>
          &quot;{msg.approvalContext}&quot;
        </div>
      )}

      {/* Payload toggle */}
      {msg.approvalPayload && Object.keys(msg.approvalPayload).length > 0 && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-3)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              marginBottom: 6,
            }}
          >
            {expanded ? '▲ hide details' : '▼ show details'}
          </button>
          {expanded && (
            <div style={{
              fontSize: 10,
              background: 'var(--bg-3)',
              color: 'var(--text-2)',
              borderRadius: 4,
              padding: '8px 10px',
              marginBottom: 10,
              overflow: 'auto',
              maxHeight: 120,
              fontFamily: 'var(--font-dm-mono, monospace)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}>
              {Object.entries(msg.approvalPayload).map(([key, val]) => (
                <div key={key} style={{ marginBottom: 4, display: 'flex', gap: 8 }}>
                  <span style={{ color: 'var(--accent)', opacity: 0.8, flexShrink: 0 }}>{key}:</span>
                  <span style={{ wordBreak: 'break-word' }}>
                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {msg.approvalError && (
        <div style={{
          fontSize: 11,
          color: '#f87171',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 4,
          padding: '6px 8px',
          marginBottom: 8,
          lineHeight: 1.45,
        }}>
          {formatErrorMessage(msg.approvalError)}
        </div>
      )}

      {/* Approve / Reject */}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          onClick={() => handle('approved')}
          disabled={!!deciding}
          style={{
            flex: 1,
            background: deciding === 'approved' ? 'rgba(74,222,128,0.25)' : 'rgba(74,222,128,0.12)',
            color: '#4ade80',
            border: '1px solid rgba(74,222,128,0.35)',
            borderRadius: 6,
            padding: '7px 0',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            cursor: deciding ? 'not-allowed' : 'pointer',
            letterSpacing: '0.04em',
            opacity: deciding && deciding !== 'approved' ? 0.4 : 1,
          }}
        >
          {deciding === 'approved' ? 'Approving…' : '✓ Approve'}
        </button>
        <button
          onClick={() => handle('rejected')}
          disabled={!!deciding}
          style={{
            flex: 1,
            background: deciding === 'rejected' ? 'rgba(248,113,113,0.25)' : 'rgba(248,113,113,0.08)',
            color: '#f87171',
            border: '1px solid rgba(248,113,113,0.3)',
            borderRadius: 6,
            padding: '7px 0',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            cursor: deciding ? 'not-allowed' : 'pointer',
            letterSpacing: '0.04em',
            opacity: deciding && deciding !== 'rejected' ? 0.4 : 1,
          }}
        >
          {deciding === 'rejected' ? 'Rejecting…' : '✗ Reject'}
        </button>
      </div>

      {/* Skip — escape hatch that dismisses the task without hitting the backend.
          Only lets the founder escape; does not consume the pending approval row. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={() => onSkip(msg.id)}
          disabled={!!deciding}
          style={{
            background: 'transparent',
            color: 'var(--text-3)',
            border: 'none',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            cursor: deciding ? 'not-allowed' : 'pointer',
            padding: 0,
            textDecoration: 'underline',
            opacity: deciding ? 0.4 : 0.7,
          }}
          title="Dismiss this card — the approval stays in the Inbox until you decide"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}

function CommandThread({
  messages,
  onDismiss,
  onApprovalDecision,
  onApprovalSkip,
}: {
  messages: InlineMessage[]
  onDismiss: (id: string) => void
  onApprovalDecision: (msgId: string, decision: 'approved' | 'rejected') => Promise<void>
  onApprovalSkip: (msgId: string) => void
}) {
  if (messages.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {messages.map(msg => {
        const accentColor = msg.type === 'dept' ? '#00D4AA' : '#a78bfa'
        const canDismiss = !msg.isLoading && !msg.approvalPending
        return (
          <div key={msg.id} style={{
            background: 'var(--bg-2)',
            border: `1px solid ${msg.approvalPending ? 'rgba(250,204,21,0.3)' : 'var(--border)'}`,
            borderLeft: `3px solid ${msg.approvalPending ? '#facc15' : accentColor}`,
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontFamily: 'var(--font-dm-mono, monospace)',
                fontSize: 10,
                fontWeight: 700,
                color: accentColor,
                letterSpacing: '0.06em',
              }}>
                {msg.type === 'dept' ? '@' : '/'}{msg.label}
              </span>
              {msg.isLoading && (
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  working…
                </span>
              )}
              {canDismiss && (
                <button
                  onClick={() => onDismiss(msg.id)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-4)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                >
                  ×
                </button>
              )}
            </div>

            {/* Input echo */}
            {msg.input && (
              <div style={{
                fontSize: 11,
                color: 'var(--text-3)',
                fontFamily: 'var(--font-dm-mono, monospace)',
                marginBottom: 6,
                opacity: 0.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.input}
              </div>
            )}

            {/* Approval card (persistent, non-dismissible) */}
            {(msg.approvalPending || msg.approvalDecision) && (
              <ApprovalCard msg={msg} onDecide={onApprovalDecision} onSkip={onApprovalSkip} />
            )}

            {/* Regular text response */}
            {!msg.approvalPending && !msg.approvalDecision && msg.response && (
              <div style={{
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontSize: 13,
                color: 'var(--text)',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {msg.response}
              </div>
            )}

            {/* Suggested next steps — shown once response is loaded */}
            {!msg.isLoading && !msg.approvalPending && (
              <>
                {msg.artifact_id && (
                  <SuggestedActionChips entityType="artifact" entityId={msg.artifact_id} />
                )}
                {msg.goal_id && !msg.artifact_id && (
                  <DeferredMissionReportChips goalId={msg.goal_id} />
                )}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── PlanningIndicator ────────────────────────────────────────────────────────

function PlanningIndicator({ mode }: { mode?: string | null }) {
  const [dots, setDots] = useState('.')
  const [msg, setMsg] = useState(() => getRandomProcessingMessage())

  useEffect(() => {
    const dInterval = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    const mInterval = setInterval(() => setMsg(getRandomProcessingMessage()), 3500)
    return () => {
      clearInterval(dInterval)
      clearInterval(mInterval)
    }
  }, [])

  const modeMeta = mode ? MODE_META[mode as OrcResponseMode] : null

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '24px 20px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 32, height: 32,
        borderRadius: '50%',
        border: '2px solid var(--border)',
        borderTopColor: modeMeta?.color ?? '#facc15',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto 12px',
      }} />
      <div style={{
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 11,
        color: modeMeta?.color ?? '#facc15',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        minHeight: '1.2em'
      }}>
        {msg}{dots}
      </div>
      <div style={{
        fontFamily: 'var(--font-dm-sans, sans-serif)',
        fontSize: 12,
        color: 'var(--text-3)',
        marginTop: 6,
      }}>
        {modeMeta ? modeMeta.description : 'Orc is coordinating departments and drafting your plan'}
      </div>
      {modeMeta && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center' }}>
          <OrcModeBadge mode={mode!} />
        </div>
      )}
    </div>
  )
}

// ─── TaskApprovalItem ─────────────────────────────────────────────────────────

type TaskDecision = 'approved' | 'rejected' | 'held' | 'skipped' | null

function TaskApprovalItem({
  task,
  dbTask,
  decision,
  onApprove,
  onReject,
  onHold,
  onRetry,
  onSkip,
  onMarkDone,
  departments,
}: {
  task: OrchestratorTask
  dbTask?: any
  decision: TaskDecision
  onApprove: (overrides?: { label?: string; reasoning?: string }) => void
  onReject: () => void
  onHold: () => void
  onRetry?: () => void
  onSkip?: () => void
  onMarkDone?: () => void
  departments: Department[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedLabel, setEditedLabel] = useState(task.label)
  const [editedReasoning, setEditedReasoning] = useState(task.reasoning)

  const risk = RISK_COLOURS[task.risk_level]
  
  const deptData = departments.find(d => d.slug === task.dept)
  const deptColour = deptData?.color ?? DEFAULT_DEPT_COLOUR
  const deptIcon = resolveIcon(deptData?.icon ?? DEFAULT_DEPT_ICON)

  const decisionLabel: Record<string, string> = {
    approved: '✓ DISPATCHED',
    rejected: '✗ REJECTED',
    held:     '⏸ HELD',
    running:  '⚡ RUNNING',
    completed: '✓ COMPLETED',
    failed:    '⚠ FAILED',
    planned:   '⏳ WAITING',
    needs_data: '❓ BLOCKED',
    skipped:    '↷ SKIPPED',
  }

  // Use DB status if it's more "advanced" than the local decision.
  // DB statuses that mean work is already in flight or done take priority over null local decision.
  const DB_ACTIONED_STATUSES: GoalTaskStatus[] = ['approved', 'running', 'completed', 'failed', 'skipped', 'needs_data']
  const isDbActioned = !!dbTask && DB_ACTIONED_STATUSES.includes(dbTask.status)
  const resolvedStatus = dbTask?.status || decision
  const statusLabel = decisionLabel[resolvedStatus || ''] || ''
  // A task is "actioned" if the founder made a local decision OR the DB already reflects work in progress/done.
  const isActioned = !!(decision) || isDbActioned

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: `1px solid ${decision ? 'var(--border)' : 'var(--border)'}`,
      borderLeft: `3px solid ${deptColour}`,
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      opacity: decision === 'rejected' ? 0.5 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        {/* Dept badge */}
        <span style={{
          background: `${deptColour}22`,
          color: deptColour,
          border: `1px solid ${deptColour}44`,
          borderRadius: 4,
          padding: '2px 7px',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          letterSpacing: '0.08em',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          <span style={{
            marginRight: 4,
            fontSize: 12,
          }}>
            {deptIcon}
          </span>
          {task.dept}
        </span>

        {/* Label or Edit Field */}
        {isEditing ? (
          <input
            value={editedLabel}
            onChange={(e) => setEditedLabel(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-3)',
              border: '1px solid var(--accent)',
              borderRadius: 4,
              color: 'var(--text)',
              fontSize: 13,
              padding: '2px 8px',
              fontFamily: 'var(--font-dm-sans, sans-serif)',
            }}
          />
        ) : (
          <span style={{
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 13,
            color: 'var(--text)',
            fontWeight: 500,
            flex: 1,
          }}>
            {task.label}
          </span>
        )}

        {/* Risk badge */}
        <span style={{
          background: risk.bg,
          color: risk.text,
          border: `1px solid ${risk.border}`,
          borderRadius: 4,
          padding: '2px 7px',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          letterSpacing: '0.06em',
          flexShrink: 0,
          textTransform: 'uppercase',
        }}>
          {task.risk_level}
        </span>
      </div>

      {/* Reasoning or Edit Field */}
      {isEditing ? (
        <textarea
          value={editedReasoning}
          onChange={(e) => setEditedReasoning(e.target.value)}
          rows={3}
          style={{
            width: '100%',
            background: 'var(--bg-3)',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            color: 'var(--text-2)',
            fontSize: 12,
            padding: '4px 8px',
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            marginBottom: 10,
            resize: 'none',
          }}
        />
      ) : (
        <div style={{
          fontFamily: 'var(--font-dm-sans, sans-serif)',
          fontSize: 12,
          color: 'var(--text-2)',
          lineHeight: 1.5,
          marginBottom: 10,
          paddingLeft: 2,
        }}>
          {task.reasoning}
        </div>
      )}

      {/* Action buttons or decision indicator */}
      {isActioned ? (
        <div>
          <div style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            color: resolvedStatus === 'completed' ? '#4ade80' :
                   resolvedStatus === 'failed' ? '#f87171' :
                   (resolvedStatus === 'running' || resolvedStatus === 'dispatched') ? '#60a5fa' :
                   resolvedStatus === 'needs_data' ? '#fb923c' :
                   resolvedStatus === 'skipped' ? 'var(--text-4)' :
                   resolvedStatus === 'held' ? '#facc15' : 'var(--text-3)',
            letterSpacing: '0.06em',
          }}>
            {statusLabel}
          </div>
          {(resolvedStatus === 'failed' || resolvedStatus === 'needs_data') && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontSize: 11,
                color: resolvedStatus === 'failed' ? '#f87171' : '#fb923c',
                opacity: 0.8,
                marginBottom: 6,
                lineHeight: 1.4,
              }}>
                {resolvedStatus === 'failed' 
                  ? "This task failed. Retry or skip to continue."
                  : `Orc needs: ${Array.isArray(dbTask?.orc_notes) && dbTask!.orc_notes.length > 0 ? (dbTask!.orc_notes[dbTask!.orc_notes.length - 1] as any).note : 'More information to proceed.'}`}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {resolvedStatus === 'needs_data' && (
                  <a 
                    href="/dashboard/knowledge" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{...btnStyle('#60a5fa', '#60a5fa22'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center'}}
                  >
                    ↑ Upload Data
                  </a>
                )}
                {onRetry && (
                  <button onClick={onRetry} style={btnStyle('#facc15', '#facc1522')}>
                    ↻ Retry
                  </button>
                )}
                {onSkip && (
                  <button onClick={onSkip} style={btnStyle('var(--text-3)', 'var(--bg-3)')}>
                    Skip
                  </button>
                )}
              </div>
            </div>
          )}
          {resolvedStatus === 'skipped' && (
            <div style={{ 
              marginTop: 6, 
              fontSize: 11, 
              color: 'var(--text-4)', 
              fontStyle: 'italic',
              fontFamily: 'var(--font-dm-sans, sans-serif)'
            }}>
              Task skipped by founder. Downstream tasks will proceed with partial context.
            </div>
          )}

          {(resolvedStatus === 'dispatched' || resolvedStatus === 'running') && onMarkDone && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontSize: 11,
                color: '#60a5fa',
                opacity: 0.7,
                marginBottom: 6,
              }}>
                Task is running. If it finished outside the system, mark it done.
              </div>
              <button onClick={onMarkDone} style={btnStyle('#4ade80', '#4ade8022')}>
                ✓ Mark Done
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          {isEditing ? (
            <>
              <button 
                onClick={() => {
                  onApprove({ label: editedLabel, reasoning: editedReasoning })
                  setIsEditing(false)
                }} 
                style={btnStyle('#4ade80', '#4ade8022')}
              >
                Save & Approve
              </button>
              <button 
                onClick={() => {
                  setIsEditing(false)
                  setEditedLabel(task.label)
                  setEditedReasoning(task.reasoning)
                }} 
                style={btnStyle('var(--text-3)', 'var(--bg-3)')}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button onClick={() => onApprove()} style={btnStyle('#4ade80', '#4ade8022')}>
                Approve
              </button>
              <button 
                onClick={() => setIsEditing(true)} 
                style={btnStyle('#6366f1', '#6366f122')}
              >
                Edit
              </button>
              <button onClick={onReject} style={btnStyle('#f87171', '#f8717122')}>
                Reject
              </button>
              <button onClick={onHold} style={btnStyle('var(--text-3)', 'var(--bg-3)')}>
                Hold
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function btnStyle(color: string, bg: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: `1px solid ${color}44`,
    borderRadius: 4,
    padding: '4px 12px',
    fontFamily: 'var(--font-dm-mono, monospace)',
    fontSize: 10,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  }
}

// ─── PlanCard ────────────────────────────────────────────────────────────────

function PlanCard({
  goal,
  onDispatch,
  onReject,
  onHold,
  onDismiss,
  onCancel,
  onRetry,
  onSkip,
  onMarkDone,
  decisions,
  onApproveAll,
  departments,
}: {
  goal: Goal
  onDispatch: (taskId: string, overrides?: { label?: string; reasoning?: string }) => void
  onReject: (taskId: string) => void
  onHold: (taskId: string) => void
  onDismiss: () => void
  onCancel: () => void
  onRetry: (taskId: string) => void
  onSkip: (taskId: string) => void
  onMarkDone: (taskId: string) => void
  decisions: Record<string, TaskDecision>
  onApproveAll: () => void
  departments: Department[]
}) {
  const plan = goal.orchestrator_plan
  if (!plan) return null

  const pendingCount = plan.tasks.filter(t => !decisions[t.id]).length
  const allDone = pendingCount === 0

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      overflow: 'hidden',
      marginBottom: 16,
    }}>
      {/* Plan header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}>
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 9,
              color: 'var(--text-3)',
              letterSpacing: '0.08em',
            }}>
              ORCHESTRATOR PLAN · {plan.tasks.length} TASKS
            </span>
            {goal.response_mode && (
              <OrcModeBadge mode={goal.response_mode} confidence={goal.orc_decision?.confidence} />
            )}
          </div>
          <div style={{
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 13,
            color: 'var(--text)',
            fontWeight: 500,
          }}>
            {goal.title}
          </div>
          <OrcReasoningPanel decision={goal.orc_decision ?? null} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {pendingCount > 1 && !allDone && (
            <button onClick={onApproveAll} style={{
              background: 'rgba(99,102,241,0.15)',
              color: '#818cf8',
              border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: 4,
              padding: '5px 12px',
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}>
              Approve All ({pendingCount})
            </button>
          )}
          {['awaiting_approval', 'executing'].includes(goal.status) && (
            <button onClick={onCancel} style={{
              background: 'rgba(239,68,68,0.08)',
              color: '#f87171',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 4,
              padding: '5px 12px',
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              cursor: 'pointer',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
            }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Risk note — PROMINENT per spec */}
      {goal.risk_note && (
        <div style={{
          padding: '10px 16px',
          background: 'rgba(249,115,22,0.06)',
          borderBottom: '1px solid rgba(249,115,22,0.2)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}>
          <span style={{ color: '#fb923c', fontSize: 12, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <span style={{
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 12,
            color: '#fb923c',
            lineHeight: 1.4,
          }}>
            {goal.risk_note}
          </span>
        </div>
      )}

      {/* Task list */}
      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plan.tasks.map((task) => (
          <TaskApprovalItem
            key={task.id}
            task={task}
            dbTask={goal.goal_tasks?.find(gt => gt.task_id === task.id)}
            decision={decisions[task.id] ?? null}
            onApprove={(overrides) => onDispatch(task.id, overrides)}
            onReject={() => onReject(task.id)}
            onHold={() => onHold(task.id)}
            onRetry={() => onRetry(task.id)}
            onSkip={() => onSkip(task.id)}
            onMarkDone={() => onMarkDone(task.id)}
            departments={departments}
          />
        ))}
      </div>

      {/* Footer */}
      {allDone && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            color: '#4ade80',
            letterSpacing: '0.06em',
          }}>
            ✓ ALL TASKS ACTIONED
          </div>
          <button 
            onClick={onDismiss}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-3)',
              fontSize: 9,
              padding: '3px 8px',
              fontFamily: 'var(--font-dm-mono, monospace)',
              cursor: 'pointer'
            }}>
            DISMISS
          </button>
        </div>
      )}
    </div>
  )
}

// ─── RecurringMissionModal ────────────────────────────────────────────────────

function RecurringMissionModal({
  goalId,
  founderInput,
  goalTitle,
  onClose,
  onSuccess,
}: {
  goalId: string
  founderInput: string
  goalTitle: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [cadence, setCadence] = useState<'daily' | 'weekly' | 'monthly'>('weekly')
  const [autoDispatch, setAutoDispatch] = useState(false)
  const [riskTierLimit, setRiskTierLimit] = useState<1 | 2 | 3>(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/recurring-missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goalTitle.slice(0, 200),
          founder_input: founderInput,
          cadence,
          auto_dispatch: autoDispatch,
          risk_tier_limit: riskTierLimit,
          source_goal_id: goalId,
        }),
      })
      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error ?? 'Failed to create recurring mission')
      }
      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const CADENCE_LABELS: Record<string, string> = {
    daily: 'Daily — every morning at 9am',
    weekly: 'Weekly — same day each week at 9am',
    monthly: 'Monthly — same date each month at 9am',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: 28,
        width: '100%',
        maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
      }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'var(--font-dm-mono, monospace)', marginBottom: 6 }}>
            Recurring Mission
          </div>
          <h3 style={{ fontFamily: 'var(--font-syne, sans-serif)', fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
            Set as Recurring
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, marginBottom: 0, lineHeight: 1.5 }}>
            Orc will re-run this goal automatically on your chosen cadence.
          </p>
        </div>

        {/* Cadence */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>Cadence</div>
          {(['daily', 'weekly', 'monthly'] as const).map(c => (
            <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="cadence"
                value={c}
                checked={cadence === c}
                onChange={() => setCadence(c)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 13, color: 'var(--text)' }}>{CADENCE_LABELS[c]}</span>
            </label>
          ))}
        </div>

        {/* Auto-dispatch */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoDispatch}
            onChange={e => setAutoDispatch(e.target.checked)}
            style={{ accentColor: 'var(--accent)', width: 14, height: 14 }}
          />
          <span style={{ fontSize: 13, color: 'var(--text)' }}>
            Auto-dispatch low-risk tasks
          </span>
        </label>

        {/* Risk tier limit — only when auto_dispatch is on */}
        {autoDispatch && (
          <div style={{ marginBottom: 16, paddingLeft: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 8 }}>
              Auto-dispatch up to risk tier
            </div>
            {([1, 2, 3] as const).map(t => (
              <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="risk_tier"
                  value={t}
                  checked={riskTierLimit === t}
                  onChange={() => setRiskTierLimit(t)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ fontSize: 12, color: riskTierLimit === t ? 'var(--text)' : 'var(--text-3)' }}>
                  Tier {t} — {t === 1 ? 'assumptions only' : t === 2 ? 'minor conflicts flagged' : 'capability gaps ok'}
                </span>
              </label>
            ))}
          </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#000', fontWeight: 600,
              cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: 13,
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {isSubmitting ? 'Creating…' : 'Create Recurring Mission'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SynthesisReportCard (Phase 4) ────────────────────────────────────────────

function renderInline(text: string) {
  // Simple bold renderer
  const parts = text.split(/(\*\*.*?\*\*)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--text)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function MarkdownLite({ text }: { text: string }) {
  if (!text) return null

  // Replace legacy Post-mortem string
  const processed = text.replace(/Post-mortem/g, 'Mission Report')

  // Split by newline and process blocks
  const lines = processed.split('\n')
  const blocks: any[] = []
  let currentList: { type: 'ul' | 'ol', items: string[] } | null = null

  const flushList = () => {
    if (currentList) {
      blocks.push({ type: currentList.type, items: currentList.items })
      currentList = null
    }
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    
    // Headers
    if (trimmed.startsWith('# ')) {
      flushList()
      blocks.push({ type: 'h1', content: trimmed.slice(2) })
    } else if (trimmed.startsWith('## ')) {
      flushList()
      blocks.push({ type: 'h2', content: trimmed.slice(3) })
    } else if (trimmed.startsWith('### ')) {
      flushList()
      blocks.push({ type: 'h3', content: trimmed.slice(4) })
    } 
    // Unordered list
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push(trimmed.slice(2))
    }
    // Ordered list
    else if (/^\d+\.\s/.test(trimmed)) {
      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push(trimmed.replace(/^\d+\.\s/, ''))
    }
    // Paragraph or blank
    else if (trimmed === '') {
      flushList()
    } else {
      if (currentList) {
        // Continue list item if indented or just next line
        currentList.items[currentList.items.length - 1] += ' ' + trimmed
      } else {
        blocks.push({ type: 'p', content: trimmed })
      }
    }
  })
  flushList()

  return (
    <div className="markdown-lite">
      {blocks.map((block, i) => {
        if (block.type === 'h1') return <h1 key={i}>{renderInline(block.content)}</h1>
        if (block.type === 'h2') return <h2 key={i}>{renderInline(block.content)}</h2>
        if (block.type === 'h3') return <h3 key={i}>{renderInline(block.content)}</h3>
        if (block.type === 'ul') return (
          <ul key={i}>
            {block.items.map((item: string, j: number) => <li key={j}>{renderInline(item)}</li>)}
          </ul>
        )
        if (block.type === 'ol') return (
          <ol key={i}>
            {block.items.map((item: string, j: number) => <li key={j}>{renderInline(item)}</li>)}
          </ol>
        )
        return <p key={i}>{renderInline(block.content)}</p>
      })}
    </div>
  )
}

function SynthesisReportCard({ goalId, onDismiss, goal }: { goalId: string, onDismiss: () => void, goal?: Goal | null }) {
  const [report, setReport] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [recurringCreated, setRecurringCreated] = useState(false)
  const [feedbackState, setFeedbackState] = useState<null | 'sending' | 'up' | 'down'>(null)

  useEffect(() => {
    async function fetchReport() {
      try {
        const { data: memos } = await supabaseClient
          .from('company_memos')
          .select('*')
          .eq('goal_id', goalId)
          .eq('source_type', 'orchestrator')
          .order('created_at', { ascending: false })
          .limit(1)

        if (memos && memos.length > 0) {
          setReport(memos[0])
        }
      } catch (err) {
        console.error('[SynthesisReportCard] Failed to fetch report:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchReport()
  }, [goalId])

  if (isLoading) return <div style={{ padding: 20, color: 'var(--text-3)', fontSize: 13 }}>Synthesizing results...</div>
  if (!report) return null

  const isDirectResponseReport = Boolean(
    report.title?.toLowerCase().includes('[direct response]')
    || report.title?.toLowerCase().startsWith('direct response:')
  )

  return (
    <div className="synthesis-card">
      {/* Background Glow */}
      <div className="synthesis-glow" />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--accent)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-dm-mono, monospace)',
            }}>
              {isDirectResponseReport ? 'Orc Assistant' : 'Strategic Output'}
            </span>
            {goal?.response_mode && (
              <OrcModeBadge mode={goal.response_mode} confidence={goal.orc_decision?.confidence} />
            )}
          </div>
          <h3 style={{ 
            fontFamily: 'var(--font-syne, sans-serif)', 
            fontSize: 24, 
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}>
            {isDirectResponseReport ? 'Direct Response' : 'Mission Report'}
          </h3>
        </div>        <button 
          onClick={onDismiss}
          className="topbar-control-btn"
          style={{ 
            width: '32px', 
            height: '32px', 
            border: 'none', 
            background: 'var(--bg-3)',
            borderRadius: '50%',
            fontSize: '18px',
            color: 'var(--text-3)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-4)'}
          onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-3)'}
        >
          ×
        </button>
      </div>

      <div className="markdown-content">
        <MarkdownLite text={report.body} />
      </div>

      <div style={{
        marginTop: 32,
        paddingTop: 20,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: '12px',
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--blue) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            boxShadow: '0 4px 15px rgba(0, 212, 170, 0.25)',
          }}>
            🧠
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {isDirectResponseReport ? 'Orc Assistant' : 'Orchestrator'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
              {isDirectResponseReport ? 'Direct Chat Response' : 'Chief of Staff Pass'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Founder feedback: thumbs up / down */}
          {feedbackState === 'up' || feedbackState === 'down' ? (
            <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
              {feedbackState === 'up' ? '👍 Thanks!' : '👎 Noted'}
            </div>
          ) : (
            <>
              {(['up', 'down'] as const).map(dir => (
                <button
                  key={dir}
                  disabled={feedbackState === 'sending'}
                  onClick={async () => {
                    setFeedbackState('sending')
                    try {
                      await fetch(`/api/goals/${goalId}/feedback`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ outcome: dir === 'up' ? 'successful' : 'failed' }),
                      })
                    } catch { /* best-effort */ }
                    setFeedbackState(dir)
                  }}
                  title={dir === 'up' ? 'This went well' : 'This could be better'}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'transparent',
                    color: 'var(--text-3)',
                    cursor: feedbackState === 'sending' ? 'wait' : 'pointer',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { if (feedbackState !== 'sending') { e.currentTarget.style.borderColor = dir === 'up' ? 'var(--accent)' : 'var(--red, #f87171)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.background = 'transparent' }}
                >
                  {dir === 'up' ? '👍' : '👎'}
                </button>
              ))}
            </>
          )}

          {/* Set as Recurring */}
          {!isDirectResponseReport && (
            recurringCreated ? (
              <div style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                ✓ Recurring mission set
              </div>
            ) : (
              <button
                onClick={() => setShowRecurringModal(true)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = 'var(--text-3)' }}
              >
                ↻ Set as recurring
              </button>
            )
          )}
        </div>
      </div>

      {/* Suggest Contextual Follow-ups per §6.1 */}
      {report.id && (
        <SuggestedActionChips entityType="mission_report" entityId={report.id} />
      )}

      {showRecurringModal && goal && (
        <RecurringMissionModal
          goalId={goalId}
          founderInput={goal.founder_input}
          goalTitle={goal.title}
          onClose={() => setShowRecurringModal(false)}
          onSuccess={() => {
            setShowRecurringModal(false)
            setRecurringCreated(true)
          }}
        />
      )}
    </div>
  )
}

// ─── OrcDialogue (Phase 5) ────────────────────────────────────────────────────

function OrcDialogue({ goal, onResponse, onCancel }: { goal: Goal, onResponse: (text?: string, skip?: boolean) => void, onCancel?: () => void }) {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messages = goal.orc_conversation || []

  const handleSend = async () => {
    if (!input.trim()) return
    setIsSending(true)
    await onResponse(input)
    setInput('')
    setIsSending(false)
  }

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--accent)',
      borderRadius: 'var(--radius)',
      padding: '24px',
      marginTop: 20,
      boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    }}>
      <div style={{ marginBottom: 16 }}>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          display: 'block',
          marginBottom: 4,
        }}>
          Chief of Staff Clarification
        </span>
        <h3 style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Orc is thinking...
        </h3>
      </div>

      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: 12, 
        maxHeight: 300, 
        overflowY: 'auto',
        marginBottom: 20,
        paddingRight: 8,
      }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{
            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-3)',
            color: m.role === 'user' ? 'white' : 'var(--text)',
            padding: '10px 14px',
            borderRadius: 12,
            borderBottomRightRadius: m.role === 'user' ? 2 : 12,
            borderBottomLeftRadius: m.role === 'assistant' ? 2 : 12,
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            {m.content}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <input 
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Answer Orc's question..."
          style={{
            flex: 1,
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '10px 14px',
            color: 'var(--text)',
            fontSize: 13,
            outline: 'none',
          }}
          disabled={isSending}
        />
        <button 
          onClick={handleSend}
          disabled={isSending || !input.trim()}
          style={{
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '0 20px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            opacity: (isSending || !input.trim()) ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center', gap: 16 }}>
        <button
          onClick={() => onResponse(undefined, true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-3)',
            fontSize: 11,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Skip & Draft Plan Anyway
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              fontSize: 11,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Cancel Goal
          </button>
        )}
      </div>
    </div>
  )
}

// ─── WarRoom (main export) ────────────────────────────────────────────────────

export function WarRoom() {
  const { 
    activeGoal, 
    setActiveGoal, 
    updateActiveGoal, 
    isSubmittingGoal, 
    setIsSubmittingGoal,
    departments,
  } = useCrostStore()
  const [reportDismissed, setReportDismissed] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, TaskDecision>>({})
  const [commandMessages, setCommandMessages] = useState<InlineMessage[]>([])
  const [messagesHydrated, setMessagesHydrated] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  // One-shot error detail fetch: populated only when goal status flips to 'failed'.
  // Uses the already-imported supabaseClient — no new subscription, no polling.
  const [goalErrorEvents, setGoalErrorEvents] = useState<{ description: string; event_type: string; created_at: string }[]>([])

  // ── Calendar prep ──
  const [calendarSuggestions, setCalendarSuggestions] = useState<PrepSuggestion[]>([])
  const [calendarDismissed, setCalendarDismissed] = useState(false)
  const [goalPrefillSignal, setGoalPrefillSignal] = useState<{ value: string; ts: number } | undefined>()

  useEffect(() => {
    let cancelled = false
    fetch('/api/calendar-events?upcoming=true&days=7')
      .then(r => r.ok ? r.json() : null)
      .then(async json => {
        if (cancelled || !json?.data?.length) return
        const { buildPrepChecklist } = await import('@/lib/calendar-prep')
        const now = Date.now()
        const suggestions: PrepSuggestion[] = (json.data as CalendarEvent[]).map(event => ({
          event,
          daysUntil: Math.max(0, Math.ceil((new Date(event.date).getTime() - now) / 86_400_000)),
          checklist: buildPrepChecklist(event),
        }))
        if (!cancelled) setCalendarSuggestions(suggestions)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Rehydrate pending-approval cards from localStorage on mount and reconcile
  // with server state — if the approval has already been decided elsewhere
  // (e.g. /dashboard/approvals), reflect that here instead of showing a stale card.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COMMAND_MESSAGES_STORAGE_KEY)
      if (!raw) { setMessagesHydrated(true); return }
      const parsed = JSON.parse(raw) as InlineMessage[]
      if (!Array.isArray(parsed) || parsed.length === 0) { setMessagesHydrated(true); return }
      setCommandMessages(parsed)
      // Reconcile each approval's status with the server
      ;(async () => {
        const updates = await Promise.all(parsed.map(async (msg) => {
          if (!msg.approvalId) return msg
          try {
            const res = await fetch(`/api/approvals/${msg.approvalId}`)
            if (!res.ok) return msg
            const json = await res.json()
            const status = json?.data?.status
            if (!status || status === 'pending') return msg
            if (status === 'approved' || status === 'executed') {
              return { ...msg, approvalPending: false, approvalDecision: 'approved' as const }
            }
            if (status === 'rejected') {
              return { ...msg, approvalPending: false, approvalDecision: 'rejected' as const }
            }
            if (status === 'failed') {
              return { ...msg, approvalPending: false, approvalDecision: 'approved' as const, approvalExecutionError: json?.data?.execution_result?.error ?? 'Execution failed' }
            }
            return msg
          } catch { return msg }
        }))
        setCommandMessages(updates)
        setMessagesHydrated(true)
      })()
    } catch {
      setMessagesHydrated(true)
    }
  }, [])

  // Persist only messages with active approval state (pending or recently decided)
  useEffect(() => {
    if (!messagesHydrated) return
    try {
      const toPersist = commandMessages.filter(m => m.approvalPending || m.approvalDecision)
      if (toPersist.length === 0) {
        localStorage.removeItem(COMMAND_MESSAGES_STORAGE_KEY)
      } else {
        localStorage.setItem(COMMAND_MESSAGES_STORAGE_KEY, JSON.stringify(toPersist))
      }
    } catch { /* quota / SSR — ignore */ }
  }, [commandMessages, messagesHydrated])

  // Sync decisions with existing DB task statuses when the active goal changes.
  // This ensures that after navigation (which resets local state), tasks that are
  // already running/completed/failed in the DB are correctly reflected without
  // re-showing the Approve buttons.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activeGoal?.goal_tasks || activeGoal.goal_tasks.length === 0) {
      setDecisions({})
      return
    }
    // Only statuses that are in GoalTaskStatus and mean "work is in flight or done"
    const DB_ACTIONED: GoalTaskStatus[] = ['approved', 'running', 'completed', 'failed']
    const synced: Record<string, TaskDecision> = {}
    for (const dbTask of activeGoal.goal_tasks) {
      if (DB_ACTIONED.includes(dbTask.status)) {
        synced[dbTask.task_id] = 'approved'
      }
    }
    setDecisions(synced)
  }, [activeGoal?.id, activeGoal?.goal_tasks])

  // One-shot: when the active goal flips to 'failed', fetch the last 3 error-level
  // events for that goal so we can surface useful detail inline without making
  // the user navigate away to the Event Log. Zero extra subscriptions — this is
  // a single SELECT that fires once per failure.
  useEffect(() => {
    if (activeGoal?.status !== 'failed' || !activeGoal?.id) return
    setGoalErrorEvents([]) // reset from any prior failure
    supabaseClient
      .from('event_log')
      .select('description, event_type, created_at')
      .eq('goal_id', activeGoal.id)
      .in('event_type', ['error', 'task_failed', 'orc_stall_detected'])
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }: { data: any }) => {
        if (data && data.length > 0) setGoalErrorEvents(data)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoal?.status, activeGoal?.id])

  // Automatically clear SYSTEM_LIMIT_EXCEEDED errors once the reset time has passed.
  // This ensures the "limit reached" banner doesn't persist across days.
  useEffect(() => {
    if (activeGoal?.status !== 'failed' || !activeGoal.outcome) return

    let outcomeObj: any = null
    try {
      outcomeObj = typeof activeGoal.outcome === 'string' ? JSON.parse(activeGoal.outcome) : activeGoal.outcome
    } catch {
      return
    }

    if (outcomeObj?.code === 'SYSTEM_LIMIT_EXCEEDED' && outcomeObj.resetAt) {
      const resetTime = new Date(outcomeObj.resetAt).getTime()
      const now = Date.now()
      const delay = resetTime - now

      if (delay <= 0) {
        setActiveGoal(null)
      } else {
        const timer = setTimeout(() => setActiveGoal(null), delay)
        return () => clearTimeout(timer)
      }
    }
  }, [activeGoal?.status, activeGoal?.outcome, setActiveGoal])

  // On mount: pick up any pending goal left by the onboarding flow.
  // The handoff ALWAYS wins over any persisted activeGoal — a stale goal from a
  // prior account/session lives in localStorage (see store.ts partialize) and
  // would otherwise shadow the freshly-created onboarding goal, causing the
  // poll loop to 404 forever on a dead id.
  useEffect(() => {
    try {
      const pendingId = localStorage.getItem('crost-pending-goal-id')
      if (!pendingId) return
      localStorage.removeItem('crost-pending-goal-id')
      fetch(`/api/goals/${pendingId}`)
        .then(r => r.json())
        .then(json => {
          if (json.success && json.data) {
            setActiveGoal(json.data)
          } else {
            // Onboarding goal went missing — drop any stale persisted goal too
            setActiveGoal(null)
          }
        })
        .catch(() => {})
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll for plan when goal is in 'planning' or 'executing' or 'awaiting_approval' status.
  // Depend only on goal ID + status (not the full object) so the interval is not reset
  // on every poll response — prevents the ~700ms polling storm.
  const activeGoalId = activeGoal?.id
  const activeGoalStatus = activeGoal?.status
  useEffect(() => {
    if (!activeGoalId || !['pending', 'planning', 'clarifying', 'executing', 'awaiting_approval'].includes(activeGoalStatus ?? '')) return
    let consecutiveFailures = 0
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/goals/${activeGoalId}`)
        if (res.status === 401) {
          // Session expired mid-poll — stop the loop and bounce to sign-in so the
          // user doesn't sit in front of a silently-dead War Room.
          clearInterval(interval)
          setPollError('Your session expired. Redirecting to sign in…')
          if (typeof window !== 'undefined') {
            const next = encodeURIComponent(window.location.pathname + window.location.search)
            window.location.href = `/login?next=${next}`
          }
          return
        }
        if (res.status === 404) {
          // The goal is gone (deleted, wrong tenant, or stale persisted id from
          // a prior session). Retrying won't help — stop polling and clear the
          // store so the War Room returns to its empty state.
          clearInterval(interval)
          setPollError(null)
          setActiveGoal(null)
          setIsSubmittingGoal(false)
          return
        }
        if (!res.ok) {
          // 502/500/429 etc. — the goal is "live" but we can't reach the server.
          // Don't silently retry forever; surface a visible banner after a few misses.
          consecutiveFailures++
          if (consecutiveFailures >= 3) {
            setPollError(`Can't reach the server (HTTP ${res.status}). Your goal is still running — retrying…`)
          }
          return
        }
        const text = await res.text()
        let json: any
        try { json = JSON.parse(text) } catch {
          consecutiveFailures++
          if (consecutiveFailures >= 3) {
            setPollError(`Server returned a non-JSON response (likely a gateway error). Still retrying…`)
          }
          return
        }
        if (json.success && json.data) {
          consecutiveFailures = 0
          setPollError(null)
          updateActiveGoal(json.data)
          if (['completed', 'failed', 'cancelled', 'synthesis_done'].includes(json.data.status)) {
            clearInterval(interval)
            setIsSubmittingGoal(false)
          }
        } else {
          consecutiveFailures++
          if (consecutiveFailures >= 3) {
            setPollError(json?.error ?? 'Goal poll returned an unexpected response.')
          }
        }
      } catch (err: any) {
        consecutiveFailures++
        if (consecutiveFailures >= 3) {
          setPollError(`Network error while polling goal: ${err?.message ?? 'unknown'}`)
        }
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [activeGoalId, activeGoalStatus, setActiveGoal, setIsSubmittingGoal, updateActiveGoal])

  const handleGoalSubmit = useCallback(async (founderInput: string) => {
    setIsSubmittingGoal(true)
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ founder_input: founderInput }),
      })
      const json = await res.json()
      if (json.success && json.data) {
        setActiveGoal(json.data)
      } else {
        toast(formatErrorMessage(json.error ?? 'Failed to submit goal'), 'error')
        setIsSubmittingGoal(false)
      }
    } catch {
      toast('Could not reach the server. Please check your connection.', 'error')
      setIsSubmittingGoal(false)
    }
  }, [setActiveGoal, setIsSubmittingGoal])

  const handleApprovalDecision = useCallback(async (msgId: string, decision: 'approved' | 'rejected') => {
    const msg = commandMessages.find(m => m.id === msgId)
    if (!msg?.approvalId) {
      setCommandMessages(msgs => msgs.map(m =>
        m.id === msgId
          ? { ...m, approvalError: 'This approval is missing its ID — it was not saved correctly. Retry the task from scratch.' }
          : m
      ))
      return
    }
    // Clear any prior error before attempting
    setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, approvalError: undefined } : m))
    try {
      const res = await fetch(`/api/approvals/${msg.approvalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      let json: any = {}
      try { json = await res.json() } catch { /* non-JSON body */ }
      if (!res.ok) {
        const errText = json?.error ?? `Request failed (${res.status})`
        setCommandMessages(msgs => msgs.map(m =>
          m.id === msgId ? { ...m, approvalError: errText } : m
        ))
        return
      }
      // Surface any execution error from the server (e.g. missing composio connection)
      const execError: string | null = json?.execution_error ?? null
      // 'executed' → done. 'failed' → done with error. null → no-op approval (nothing to execute server-side), treat as done.
      const execStatus: 'executed' | 'failed' | null = json?.execution_status ?? null
      const execDone: boolean = execStatus !== 'failed' // anything not 'failed' counts as a terminal state
      setCommandMessages(msgs => msgs.map(m =>
        m.id === msgId
          ? {
              ...m,
              approvalPending: false,
              approvalDecision: decision,
              approvalExecutionError: execError ?? undefined,
              approvalExecuted: decision === 'approved' ? execDone : undefined,
            }
          : m
      ))

      // Safety-net polling: if server returned approved but execution_status is missing
      // (e.g. edge function timed out mid-execution), poll the approval row until it
      // reaches a terminal state so the UI doesn't stay on "ACTION EXECUTING" forever.
      if (decision === 'approved' && !execDone && msg.approvalId) {
        const approvalId = msg.approvalId
        const deadline = Date.now() + 90_000 // 90s cap
        const poll = async () => {
          while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 2500))
            try {
              const r = await fetch(`/api/approvals/${approvalId}`)
              if (r.status === 404) {
                setCommandMessages(msgs => msgs.map(m =>
                  m.id === msgId
                    ? { ...m, approvalExecuted: true, approvalExecutionError: 'Approval request is missing or was deleted.' }
                    : m
                ))
                return
              }
              if (!r.ok) continue
              const j = await r.json()
              const st = j?.data?.status
              if (st === 'executed' || st === 'failed' || st === 'rejected') {
                setCommandMessages(msgs => msgs.map(m =>
                  m.id === msgId
                    ? {
                        ...m,
                        approvalExecuted: st !== 'failed',
                        approvalExecutionError: st === 'failed'
                          ? (j?.data?.execution_result?.error ?? 'Execution failed.')
                          : m.approvalExecutionError,
                      }
                    : m
                ))
                return
              }
            } catch { /* keep polling */ }
          }
          // Timed out — surface a soft message so the UI isn't perpetually stuck
          setCommandMessages(msgs => msgs.map(m =>
            m.id === msgId && !m.approvalExecuted
              ? { ...m, approvalExecuted: true, approvalExecutionError: m.approvalExecutionError ?? 'Execution is taking longer than expected. Check the event log.' }
              : m
          ))
        }
        poll()
      }
    } catch (err: any) {
      console.error('[handleApprovalDecision]', err)
      setCommandMessages(msgs => msgs.map(m =>
        m.id === msgId
          ? { ...m, approvalError: `Network error: ${formatErrorMessage(err?.message ?? 'could not reach server')}` }
          : m
      ))
    }
  }, [commandMessages])

  // Skip / dismiss — removes the card from the inline thread but leaves the
  // underlying approval_queue row pending so it still shows up in the Inbox /
  // bell notifications. Founder can decide later there.
  const handleApprovalSkip = useCallback((msgId: string) => {
    setCommandMessages(msgs => msgs.filter(m => m.id !== msgId))
  }, [])

  const handleChatSubmit = useCallback(async (rawInput: string) => {
    const parsed = parseInput(rawInput)

    if (parsed.type === 'department') {
      // Gate: refuse @dept references that don't correspond to an active department
      // the founder has set up. This prevents silent failures where the user types
      // @marketing but no such dept exists (or it's still in draft).
      const dept = departments.find(d => d.slug.toLowerCase() === parsed.slug.toLowerCase())
      if (!dept) {
        const msgId = `dept-${Date.now()}`
        setCommandMessages(msgs => [...msgs, {
          id: msgId, type: 'dept', label: parsed.slug, input: parsed.message, isLoading: false,
          response: `⚠ No department named "@${parsed.slug}" is set up. Create it in Departments first.`,
        }])
        return
      }
      if (dept.activation_stage !== 'active') {
        const msgId = `dept-${Date.now()}`
        setCommandMessages(msgs => [...msgs, {
          id: msgId, type: 'dept', label: parsed.slug, input: parsed.message, isLoading: false,
          response: `⚠ @${parsed.slug} is in "${dept.activation_stage}" stage — activate it in Departments before dispatching tasks.`,
        }])
        return
      }

      const msgId = `dept-${Date.now()}`
      setCommandMessages(msgs => [...msgs, { id: msgId, type: 'dept', label: parsed.slug, input: parsed.message, isLoading: true }])
      try {
        const res = await fetch(`/api/departments/${parsed.slug}/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: parsed.message }),
        })
        const json = await res.json()
        // Surface missing-connection cleanly — user must connect the tool first
        if (!res.ok && json?.missing_connection) {
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? {
            ...m,
            isLoading: false,
            response: `⚠ ${json.service?.toUpperCase?.() ?? 'This tool'} is not connected. Open Settings → Integrations and connect it, then retry.`,
          } : m))
          return
        }
        if (!res.ok) {
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? {
            ...m,
            isLoading: false,
            response: `Error: ${formatErrorMessage(json?.error ?? `Request failed (${res.status})`)}`,
          } : m))
          return
        }
        if (json.approval_requested) {
          // Show human-readable approval card — never display the raw block
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? {
            ...m,
            isLoading: false,
            approvalPending: true,
            approvalId: json.approval_id,
            approvalActionLabel: json.action_label,
            approvalActionType: json.action_type,
            approvalContext: json.context,
            approvalRiskLevel: json.risk_level,
            approvalPayload: json.payload,
            approvalDeptName: json.department_name,
          } : m))
        } else {
          const response = json.answer ?? json.result ?? json.message ?? (json.error ? `Error: ${formatErrorMessage(json.error)}` : JSON.stringify(json))
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response, isLoading: false, goal_id: json.goal_id ?? undefined } : m))
        }
      } catch (err: any) {
        setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response: `Error: ${formatErrorMessage(err.message)}`, isLoading: false } : m))
      }
      return
    }

    if (parsed.type === 'tool') {
      const toolLabel = parsed.action !== parsed.service ? `${parsed.service}.${parsed.action}` : parsed.service
      const msgId = `tool-${Date.now()}`
      setCommandMessages(msgs => [...msgs, { id: msgId, type: 'tool', label: toolLabel, input: parsed.params, isLoading: true }])
      try {
        const res = await fetch('/api/tools/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service: parsed.service, action: parsed.action, params: parsed.params ? { text: parsed.params } : {} }),
        })
        const json = await res.json()
        if (json.requires_approval) {
          // Tool gateway approval — also show approval card
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? {
            ...m,
            isLoading: false,
            approvalPending: true,
            approvalId: json.approval_id,
            approvalActionLabel: toolLabel,
            approvalActionType: 'tool_call',
            approvalContext: `Direct tool invocation: ${toolLabel}`,
            approvalRiskLevel: 'high',
          } : m))
        } else {
          let response: string
          if (json.missing_connection) {
            response = `⚠ No connection for "${json.service}". Connect it in Settings → Integrations.`
          } else if (!json.success) {
            response = `Error: ${formatErrorMessage(json.error)}`
          } else {
            response = typeof json.result === 'string' ? json.result : JSON.stringify(json.result, null, 2)
          }
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? {
            ...m, response, isLoading: false,
            artifact_id: json.artifact_id ?? undefined,
          } : m))
        }
      } catch (err: any) {
        setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response: `Error: ${formatErrorMessage(err.message)}`, isLoading: false } : m))
      }
      return
    }

    // Regular Orc goal
    handleGoalSubmit(rawInput)
  }, [handleGoalSubmit, departments])

  const handleDialogueResponse = useCallback(async (message?: string, skip?: boolean) => {
    if (!activeGoal) return
    try {
      const res = await fetch(`/api/goals/${activeGoal.id}/dialogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, force_plan: skip }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setPollError(`Dialogue failed: ${formatErrorMessage(json.error ?? res.statusText)}`)
      }
    } catch (err: any) {
      console.error('[handleDialogueResponse]', err)
      setPollError(`Network error during dialogue: ${formatErrorMessage(err?.message ?? 'unknown')}`)
    }
  }, [activeGoal])

  const inFlightDispatches = useRef<Set<string>>(new Set())

  const handleDispatch = useCallback(async (taskId: string, overrides?: { label?: string; reasoning?: string }) => {
    if (!activeGoal) return
    if (inFlightDispatches.current.has(taskId)) return
    
    inFlightDispatches.current.add(taskId)
    setDecisions(d => ({ ...d, [taskId]: 'approved' }))
    
    try {
      const res = await fetch(`/api/goals/${activeGoal.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          ...(overrides && { task_override: overrides })
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setPollError(`Dispatch failed: ${formatErrorMessage(json.error ?? res.statusText)}`)
        setDecisions(d => ({ ...d, [taskId]: null }))
      }
    } catch (err: any) {
      console.error('[WarRoom] dispatch failed', err)
      setPollError(`Network error while dispatching task: ${formatErrorMessage(err?.message ?? 'unknown')}`)
      setDecisions(d => ({ ...d, [taskId]: null }))
    } finally {
      inFlightDispatches.current.delete(taskId)
    }
  }, [activeGoal])

  const handleReject = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    setDecisions(d => ({ ...d, [taskId]: 'rejected' }))
    try {
      const res = await fetch(`/api/goals/${activeGoal.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setPollError(`Reject failed: ${formatErrorMessage(json.error ?? res.statusText)}`)
        setDecisions(d => ({ ...d, [taskId]: null }))
      }
    } catch (err: any) {
      console.error('[WarRoom] reject failed', err)
      setPollError(`Network error while rejecting task: ${formatErrorMessage(err?.message ?? 'unknown')}`)
      setDecisions(d => ({ ...d, [taskId]: null }))
    }
  }, [activeGoal])

  const handleHold = useCallback((taskId: string) => {
    setDecisions(d => ({ ...d, [taskId]: 'held' }))
  }, [])

  const handleApproveAll = useCallback(() => {
    if (!activeGoal?.orchestrator_plan?.tasks) return
    const pending = activeGoal.orchestrator_plan.tasks.filter(t => !decisions[t.id])
    pending.forEach(t => handleDispatch(t.id))
  }, [activeGoal, decisions, handleDispatch])

  const handleCancelGoal = useCallback(async () => {
    if (!activeGoal) return
    try {
      await fetch(`/api/goals/${activeGoal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
    } catch (err) {
      console.error('[WarRoom] cancel goal failed', err)
    } finally {
      setActiveGoal(null)
      setIsSubmittingGoal(false)
    }
  }, [activeGoal, setActiveGoal, setIsSubmittingGoal])

  const handleRetryTask = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    // Clear failed decision so the task re-enters dispatching state
    setDecisions(d => ({ ...d, [taskId]: null }))
    await handleDispatch(taskId)
  }, [activeGoal, handleDispatch])

  const handleSkipTask = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    setDecisions(d => ({ ...d, [taskId]: 'skipped' }))
    try {
      await fetch(`/api/goals/${activeGoal.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped' }),
      })
    } catch (err) {
      console.error('[WarRoom] skip task failed', err)
    }
  }, [activeGoal])

  const handleMarkDoneTask = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    setDecisions(d => ({ ...d, [taskId]: 'approved' }))
    try {
      await fetch(`/api/goals/${activeGoal.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      })
    } catch (err) {
      console.error('[WarRoom] mark done failed', err)
    }
  }, [activeGoal])

  const isPlanning = activeGoal && ['pending', 'planning'].includes(activeGoal.status)
  const hasPlan = activeGoal && activeGoal.orchestrator_plan && activeGoal.status !== 'failed'
  const isClarifying = activeGoal?.status === 'clarifying'
  const isCompleted = activeGoal?.status === 'completed'

  // Removed buggy auto-dismiss logic that cleared the goal prematurely when tasks failed or were executing.

  return (
    <div style={{ marginBottom: 24 }}>
      {!calendarDismissed && calendarSuggestions.length > 0 && (
        <CalendarPrepPanel
          suggestions={calendarSuggestions}
          onPrefill={prompt => setGoalPrefillSignal({ value: prompt, ts: Date.now() })}
          onDismiss={() => setCalendarDismissed(true)}
        />
      )}

      <GoalInput
        onSubmit={handleChatSubmit}
        isLoading={isSubmittingGoal || !!isPlanning}
        hasActiveGoal={!!activeGoal}
        departments={departments}
        prefillSignal={goalPrefillSignal}
      />

      <CommandThread
        messages={commandMessages}
        onDismiss={id => setCommandMessages(msgs => msgs.filter(m => m.id !== id))}
        onApprovalDecision={handleApprovalDecision}
        onApprovalSkip={handleApprovalSkip}
      />

      {pollError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius)',
          padding: '10px 14px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ color: '#f87171', fontSize: 14 }}>⚠</span>
          <span style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 12, color: '#f87171', lineHeight: 1.45, flex: 1 }}>
            {pollError}
          </span>
          <button
            onClick={() => setPollError(null)}
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 16, padding: 0 }}
            title="Dismiss"
          >×</button>
        </div>
      )}

      {isPlanning && <PlanningIndicator mode={activeGoal?.response_mode} />}

      {isClarifying && (
        <OrcDialogue
          goal={activeGoal}
          onResponse={handleDialogueResponse}
          onCancel={handleCancelGoal}
        />
      )}

      {hasPlan && activeGoal && !['completed', 'clarifying', 'failed'].includes(activeGoal.status) && (
        <PlanCard
          goal={activeGoal}
          decisions={decisions}
          onDispatch={handleDispatch}
          onReject={handleReject}
          onHold={handleHold}
          onDismiss={() => setActiveGoal(null)}
          onCancel={handleCancelGoal}
          onRetry={handleRetryTask}
          onSkip={handleSkipTask}
          onMarkDone={handleMarkDoneTask}
          onApproveAll={handleApproveAll}
          departments={departments}
        />
      )}

      {isCompleted && activeGoal && (
        <SynthesisReportCard
          goalId={activeGoal.id}
          onDismiss={() => setActiveGoal(null)}
          goal={activeGoal}
        />
      )}

      {activeGoal?.status === 'failed' && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          position: 'relative',
        }}>
          <button
            onClick={() => setActiveGoal(null)}
            style={{
              position: 'absolute',
              top: 10,
              right: 12,
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 16,
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
            title="Dismiss"
          >×</button>
          
          <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 13, color: '#f87171', marginBottom: 4, paddingRight: 20 }}>
            ⚠ Orchestrator failed to generate a plan.
          </div>
          {activeGoal.outcome && (
            <div style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: '#f87171',
              opacity: 0.7,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: goalErrorEvents.length > 0 ? 10 : 0,
            }}>
              {formatErrorMessage(activeGoal.outcome)}
            </div>
          )}

          {/* Inline error detail — populated by one-shot fetch on failure */}
          {goalErrorEvents.length > 0 && (
            <div style={{
              background: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.15)',
              borderRadius: 6,
              padding: '8px 10px',
              marginBottom: 10,
            }}>
              <div style={{
                fontFamily: 'var(--font-dm-mono, monospace)',
                fontSize: 9,
                color: '#f87171',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
                opacity: 0.7,
              }}>What went wrong</div>
              {goalErrorEvents.map((ev, i) => (
                <div key={i} style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                  paddingBottom: i < goalErrorEvents.length - 1 ? 6 : 0,
                  marginBottom: i < goalErrorEvents.length - 1 ? 6 : 0,
                  borderBottom: i < goalErrorEvents.length - 1 ? '1px solid rgba(239,68,68,0.1)' : 'none',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 9,
                    color: 'rgba(248,113,113,0.6)',
                    whiteSpace: 'nowrap',
                    paddingTop: 1,
                  }}>
                    {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 10,
                    color: '#f87171',
                    lineHeight: 1.5,
                    wordBreak: 'break-word',
                  }}>
                    {ev.description.replace(/Post-mortem/g, 'Mission Report')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>Try rephrasing your goal, or</span>
            <a
              href={`/dashboard/event-log?goal_id=${activeGoal.id}`}
              style={{
                color: 'var(--accent)',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 11,
                borderBottom: '1px solid rgba(0,212,170,0.3)',
                paddingBottom: 1,
              }}
            >
              view full event log →
            </a>
          </div>        </div>
      )}
    </div>
  )
}
