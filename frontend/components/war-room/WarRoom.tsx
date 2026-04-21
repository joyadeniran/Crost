'use client'

// components/war-room/WarRoom.tsx
// The War Room: goal input + live plan card + per-task approve/reject.
// This is the core of the founder→orchestrator→worker loop.
import { supabaseClient } from '@/lib/supabase-browser'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useCrostStore } from '@/lib/store'
import type { Goal, OrchestratorTask, RiskLevel, Department } from '@/types'
import { parseInput, getActivePrefix } from '@/lib/hooks/useInputParser'
import { ChatCommandMenu } from '@/components/chat/ChatCommandMenu'

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

// Map legacy icon-name strings → emoji for departments created before the wizard change
const ICON_MAP: Record<string, string> = {
  'briefcase':   '💼',
  'code':        '💻',
  'code-2':      '💻',
  'megaphone':   '📣',
  'handshake':   '🤝',
  'bar-chart-2': '📊',
  'chart':       '📊',
  'settings-2':  '⚙️',
  'ops':         '⚙️',
  'shield':      '🛡️',
  'flask':       '🧪',
  'globe':       '🌐',
  'users':       '👥',
  'zap':         '⚡',
  'dollar-sign': '💰',
}

function resolveIcon(icon: string): string {
  return ICON_MAP[icon] ?? icon
}


// ─── GoalInput ────────────────────────────────────────────────────────────────

function GoalInput({
  onSubmit,
  isLoading,
  hasActiveGoal,
  departments,
}: {
  onSubmit: (goal: string) => void
  isLoading: boolean
  hasActiveGoal: boolean
  departments: Department[]
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
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
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '14px 16px',
      marginBottom: 20,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          width: 6, height: 6,
          borderRadius: '50%',
          background: isLoading ? '#facc15' : '#4ade80',
          boxShadow: isLoading ? '0 0 8px #facc15' : '0 0 8px #4ade80',
          flexShrink: 0,
          animation: isLoading ? 'pulse 1s infinite' : undefined,
        }} />
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
        }}>
          {isLoading ? 'ORCHESTRATOR PLANNING…' : 'WAR ROOM'}
        </span>
        {!isLoading && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 9,
            color: 'var(--text-4)',
            opacity: 0.45,
            letterSpacing: '0.06em',
          }}>
            @ dept · / tool
          </span>
        )}
      </div>

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
        placeholder="Tell your company what to do… (@dept · /tool · ⌘↵ to send)"
        rows={2}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--text)',
          fontFamily: 'var(--font-dm-sans, sans-serif)',
          fontSize: 14,
          resize: 'none',
          lineHeight: 1.5,
          opacity: isLoading ? 0.5 : 1,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading}
          style={{
            background: value.trim() && !isLoading ? 'var(--text)' : 'var(--bg-3)',
            color: value.trim() && !isLoading ? 'var(--bg)' : 'var(--text-3)',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            cursor: value.trim() && !isLoading ? 'pointer' : 'not-allowed',
            letterSpacing: '0.04em',
            transition: 'all 0.15s',
          }}
        >
          {isLoading ? 'PLANNING…' : hasActiveGoal ? 'NEW GOAL' : 'DISPATCH'}
        </button>
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
}

const COMMAND_MESSAGES_STORAGE_KEY = 'crost-war-room-pending-approvals'

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
            ? (isFailed ? '✗ EXECUTION FAILED' : '✓ APPROVED — ACTION EXECUTING')
            : '✗ REJECTED'}
        </span>
        {isFailed && (
          <div style={{ fontSize: 11, color: '#f87171', opacity: 0.85, marginTop: 6, lineHeight: 1.45 }}>
            {msg.approvalExecutionError}
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
            <pre style={{
              fontSize: 10,
              background: 'var(--bg-3)',
              color: 'var(--text-2)',
              borderRadius: 4,
              padding: '8px 10px',
              marginBottom: 10,
              overflow: 'auto',
              maxHeight: 120,
              fontFamily: 'var(--font-dm-mono, monospace)',
            }}>
              {JSON.stringify(msg.approvalPayload, null, 2)}
            </pre>
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
          {msg.approvalError}
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
          </div>
        )
      })}
    </div>
  )
}

// ─── PlanningIndicator ────────────────────────────────────────────────────────

function PlanningIndicator() {
  const [dots, setDots] = useState('.')
  useEffect(() => {
    const t = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 500)
    return () => clearInterval(t)
  }, [])
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
        borderTopColor: '#facc15',
        animation: 'spin 0.8s linear infinite',
        margin: '0 auto 12px',
      }} />
      <div style={{
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 11,
        color: '#facc15',
        letterSpacing: '0.08em',
      }}>
        ORCHESTRATOR PLANNING{dots}
      </div>
      <div style={{
        fontFamily: 'var(--font-dm-sans, sans-serif)',
        fontSize: 12,
        color: 'var(--text-3)',
        marginTop: 6,
      }}>
        Querying departments, drafting plan
      </div>
    </div>
  )
}

// ─── TaskApprovalItem ─────────────────────────────────────────────────────────

type TaskDecision = 'approved' | 'rejected' | 'held' | null

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
  }

  // Use DB status if it's more "advanced" than the local decision
  const resolvedStatus = dbTask?.status || decision
  const statusLabel = decisionLabel[resolvedStatus || ''] || ''

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
      {decision ? (
        <div>
          <div style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 10,
            color: resolvedStatus === 'completed' ? '#4ade80' :
                   resolvedStatus === 'failed' ? '#f87171' :
                   (resolvedStatus === 'running' || resolvedStatus === 'dispatched') ? '#60a5fa' :
                   resolvedStatus === 'held' ? '#facc15' : 'var(--text-3)',
            letterSpacing: '0.06em',
          }}>
            {statusLabel}
          </div>
          {resolvedStatus === 'failed' && (
            <div style={{ marginTop: 8 }}>
              <div style={{
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontSize: 11,
                color: '#f87171',
                opacity: 0.8,
                marginBottom: 6,
              }}>
                This task failed. Retry or skip to continue.
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
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
        <div>
          <div style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 9,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
            marginBottom: 4,
          }}>
            ORCHESTRATOR PLAN · {plan.tasks.length} TASKS
          </div>
          <div style={{
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 13,
            color: 'var(--text)',
            fontWeight: 500,
          }}>
            {goal.title}
          </div>
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

// ─── SynthesisReportCard (Phase 4) ────────────────────────────────────────────

function SynthesisReportCard({ goalId, onDismiss }: { goalId: string, onDismiss: () => void }) {
  const [report, setReport] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--accent)',
      borderRadius: 'var(--radius)',
      padding: '24px',
      marginTop: 20,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    }}>
      {/* Background Glow */}
      <div style={{
        position: 'absolute',
        top: -100,
        right: -100,
        width: 300,
        height: 300,
        background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 4,
          }}>
            Strategic Synthesis
          </span>
          <h3 style={{ 
            fontFamily: 'var(--font-dm-sans, sans-serif)', 
            fontSize: 20, 
            fontWeight: 600,
            color: 'var(--text)',
            margin: 0,
          }}>
            Orc Report
          </h3>
        </div>
        <button 
          onClick={onDismiss}
          style={{
            background: 'var(--bg-3)',
            border: 'none',
            color: 'var(--text-3)',
            fontSize: 18,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          ×
        </button>
      </div>

      <div className="markdown-content" style={{
        fontFamily: 'var(--font-dm-sans, sans-serif)',
        fontSize: 14,
        color: 'var(--text-2)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
      }}>
        {report.body}
      </div>

      <div style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}>
          🧠
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Orchestrator</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>Chief of Staff Pass</div>
        </div>
      </div>
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

  // Clear decisions when a new goal is set
  useEffect(() => {
    setDecisions({})
  }, [activeGoal?.id])

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
    if (!activeGoalId || !['pending', 'planning', 'executing', 'awaiting_approval'].includes(activeGoalStatus ?? '')) return
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
    }, 2000)
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
        alert(json.error ?? 'Failed to submit goal')
        setIsSubmittingGoal(false)
      }
    } catch {
      alert('Could not reach the server. Please check your connection.')
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
      setCommandMessages(msgs => msgs.map(m =>
        m.id === msgId
          ? {
              ...m,
              approvalPending: false,
              approvalDecision: decision,
              approvalExecutionError: execError ?? undefined,
            }
          : m
      ))
    } catch (err: any) {
      console.error('[handleApprovalDecision]', err)
      setCommandMessages(msgs => msgs.map(m =>
        m.id === msgId
          ? { ...m, approvalError: `Network error: ${err?.message ?? 'could not reach server'}` }
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
            response: `Error: ${json?.error ?? `Request failed (${res.status})`}`,
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
          const response = json.answer ?? json.result ?? json.message ?? (json.error ? `Error: ${json.error}` : JSON.stringify(json))
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response, isLoading: false } : m))
        }
      } catch (err: any) {
        setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response: `Error: ${err.message}`, isLoading: false } : m))
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
            response = `Error: ${json.error}`
          } else {
            response = typeof json.result === 'string' ? json.result : JSON.stringify(json.result, null, 2)
          }
          setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response, isLoading: false } : m))
        }
      } catch (err: any) {
        setCommandMessages(msgs => msgs.map(m => m.id === msgId ? { ...m, response: `Error: ${err.message}`, isLoading: false } : m))
      }
      return
    }

    // Regular Orc goal
    handleGoalSubmit(rawInput)
  }, [handleGoalSubmit])

  const handleDialogueResponse = useCallback(async (message?: string, skip?: boolean) => {
    if (!activeGoal) return
    try {
      const res = await fetch(`/api/goals/${activeGoal.id}/dialogue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, force_plan: skip }),
      })
      if (res.ok) {
        // Optimistically flip to planning or keep at clarifying while polling
        setActiveGoal({ ...activeGoal, status: 'planning' })
      }
    } catch (err) {
      console.error('[handleDialogueResponse]', err)
    }
  }, [activeGoal, setActiveGoal])

  const inFlightDispatches = useRef<Set<string>>(new Set())

  const handleDispatch = useCallback(async (taskId: string, overrides?: { label?: string; reasoning?: string }) => {
    if (!activeGoal) return
    if (inFlightDispatches.current.has(taskId)) return
    
    inFlightDispatches.current.add(taskId)
    setDecisions(d => ({ ...d, [taskId]: 'approved' }))
    
    try {
      await fetch(`/api/goals/${activeGoal.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          task_id: taskId,
          ...(overrides && { task_override: overrides })
        }),
      })
    } catch (err) {
      console.error('[WarRoom] dispatch failed', err)
      setDecisions(d => ({ ...d, [taskId]: null }))
    } finally {
      inFlightDispatches.current.delete(taskId)
    }
  }, [activeGoal])

  const handleReject = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    setDecisions(d => ({ ...d, [taskId]: 'rejected' }))
    // Log rejection
    fetch(`/api/goals/${activeGoal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {})
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
    }
  }, [activeGoal, setActiveGoal])

  const handleRetryTask = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    // Clear failed decision so the task re-enters dispatching state
    setDecisions(d => ({ ...d, [taskId]: null }))
    await handleDispatch(taskId)
  }, [activeGoal, handleDispatch])

  const handleSkipTask = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    setDecisions(d => ({ ...d, [taskId]: 'rejected' }))
    try {
      await fetch(`/api/goals/${activeGoal.id}/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      })
    } catch (err) {
      console.error('[WarRoom] skip task failed', err)
      // Keep decision as rejected even on network error — UI stays consistent
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

  // Automatically clear active goal ONLY when all tasks are actioned AND it's not completed/clarifying
  useEffect(() => {
    if (!hasPlan || !activeGoal.orchestrator_plan || isCompleted || isClarifying) return
    const pending = activeGoal.orchestrator_plan.tasks.filter(t => !decisions[t.id]).length
    if (pending === 0 && Object.keys(decisions).length > 0) {
      const timer = setTimeout(() => {
        // Only clear if still in executing or awaiting_approval (don't clear if it's about to hit completed)
        if (['executing', 'awaiting_approval'].includes(activeGoal.status)) {
          setActiveGoal(null)
        }
      }, 8000) 
      return () => clearTimeout(timer)
    }
  }, [hasPlan, activeGoal?.orchestrator_plan, activeGoal?.status, decisions, setActiveGoal, isCompleted, isClarifying])

  return (
    <div style={{ marginBottom: 24 }}>
      <GoalInput
        onSubmit={handleChatSubmit}
        isLoading={isSubmittingGoal || !!isPlanning}
        hasActiveGoal={!!activeGoal}
        departments={departments}
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

      {isPlanning && <PlanningIndicator />}

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
        />
      )}

      {activeGoal?.status === 'failed' && (
        <div style={{
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius)',
          padding: '12px 16px',
        }}>
          <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 13, color: '#f87171', marginBottom: 4 }}>
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
            }}>
              {activeGoal.outcome}
            </div>
          )}
          <div style={{ fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
            Try rephrasing your goal, or check the event log for details.
          </div>
        </div>
      )}
    </div>
  )
}
