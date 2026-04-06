'use client'

// components/war-room/WarRoom.tsx
// The War Room: goal input + live plan card + per-task approve/reject.
// This is the core of the founder→orchestrator→worker loop.

import { useState, useEffect, useRef, useCallback } from 'react'
import { useCrostStore } from '@/lib/store'
import type { Goal, OrchestratorTask, RiskLevel } from '@/types'

// ─── Risk colours ─────────────────────────────────────────────────────────────
const RISK_COLOURS: Record<RiskLevel, { bg: string; text: string; border: string }> = {
  low:      { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  medium:   { bg: 'rgba(234,179,8,0.12)',  text: '#facc15', border: 'rgba(234,179,8,0.3)' },
  high:     { bg: 'rgba(249,115,22,0.12)', text: '#fb923c', border: 'rgba(249,115,22,0.3)' },
  critical: { bg: 'rgba(239,68,68,0.12)',  text: '#f87171', border: 'rgba(239,68,68,0.3)' },
}

const DEPT_COLOURS: Record<string, string> = {
  sales:     '#6366f1',
  marketing: '#ec4899',
  ops:       '#14b8a6',
}

// ─── GoalInput ────────────────────────────────────────────────────────────────

function GoalInput({
  onSubmit,
  isLoading,
  hasActiveGoal,
}: {
  onSubmit: (goal: string) => void
  isLoading: boolean
  hasActiveGoal: boolean
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSubmit(trimmed)
    setValue('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      </div>

      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
        placeholder="Tell your company what to do… (⌘↵ to send)"
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
  decision,
  onApprove,
  onReject,
  onHold,
}: {
  task: OrchestratorTask
  decision: TaskDecision
  onApprove: () => void
  onReject: () => void
  onHold: () => void
}) {
  const risk = RISK_COLOURS[task.risk_level]
  const deptColour = DEPT_COLOURS[task.dept] ?? '#6366f1'

  const decisionLabel: Record<NonNullable<TaskDecision>, string> = {
    approved: '✓ DISPATCHED',
    rejected: '✗ REJECTED',
    held:     '⏸ HELD',
  }

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
          {task.dept}
        </span>

        {/* Label */}
        <span style={{
          fontFamily: 'var(--font-dm-sans, sans-serif)',
          fontSize: 13,
          color: 'var(--text)',
          fontWeight: 500,
          flex: 1,
        }}>
          {task.label}
        </span>

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

      {/* Reasoning — always visible, never collapsed per spec */}
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

      {/* Action buttons or decision indicator */}
      {decision ? (
        <div style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: decision === 'approved' ? '#4ade80' : decision === 'held' ? '#facc15' : 'var(--text-3)',
          letterSpacing: '0.06em',
        }}>
          {decisionLabel[decision]}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onApprove} style={btnStyle('#4ade80', '#4ade8022')}>
            Approve
          </button>
          <button onClick={onReject} style={btnStyle('#f87171', '#f8717122')}>
            Reject
          </button>
          <button onClick={onHold} style={btnStyle('var(--text-3)', 'var(--bg-3)')}>
            Hold
          </button>
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
  decisions,
  onApproveAll,
}: {
  goal: Goal
  onDispatch: (taskId: string) => void
  onReject: (taskId: string) => void
  onHold: (taskId: string) => void
  onDismiss: () => void
  decisions: Record<string, TaskDecision>
  onApproveAll: () => void
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
            flexShrink: 0,
          }}>
            Approve All ({pendingCount})
          </button>
        )}
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
            decision={decisions[task.id] ?? null}
            onApprove={() => onDispatch(task.id)}
            onReject={() => onReject(task.id)}
            onHold={() => onHold(task.id)}
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

// ─── WarRoom (main export) ────────────────────────────────────────────────────

export function WarRoom() {
  const { activeGoal, setActiveGoal, updateActiveGoal, isSubmittingGoal, setIsSubmittingGoal } = useCrostStore()
  const [decisions, setDecisions] = useState<Record<string, TaskDecision>>({})

  // Clear decisions when a new goal is set
  useEffect(() => {
    setDecisions({})
  }, [activeGoal?.id])

  // Poll for plan when goal is in 'planning' state
  useEffect(() => {
    if (!activeGoal || !['pending', 'planning'].includes(activeGoal.status)) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/goals/${activeGoal.id}`)
        const json = await res.json()
        if (json.success && json.data) {
          updateActiveGoal(json.data)
          if (!['pending', 'planning'].includes(json.data.status)) {
            clearInterval(interval)
            setIsSubmittingGoal(false)
          }
        }
      } catch {
        // non-fatal, keep polling
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeGoal?.id, activeGoal?.status])

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

  const handleDispatch = useCallback(async (taskId: string) => {
    if (!activeGoal) return
    setDecisions(d => ({ ...d, [taskId]: 'approved' }))
    try {
      await fetch(`/api/goals/${activeGoal.id}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })
    } catch (err) {
      console.error('[WarRoom] dispatch failed', err)
      setDecisions(d => ({ ...d, [taskId]: null }))
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

  const isPlanning = activeGoal && ['pending', 'planning'].includes(activeGoal.status)
  const hasPlan = activeGoal && activeGoal.orchestrator_plan && activeGoal.status !== 'failed'

  // Automatically clear active goal when all tasks are actioned
  useEffect(() => {
    if (!hasPlan || !activeGoal.orchestrator_plan) return
    const pending = activeGoal.orchestrator_plan.tasks.filter(t => !decisions[t.id]).length
    if (pending === 0 && Object.keys(decisions).length > 0) {
      const timer = setTimeout(() => {
        setActiveGoal(null)
      }, 5000) // Clear after 5 seconds
      return () => clearTimeout(timer)
    }
  }, [hasPlan, activeGoal?.orchestrator_plan, decisions, setActiveGoal])

  return (
    <div style={{ marginBottom: 24 }}>
      <GoalInput
        onSubmit={handleGoalSubmit}
        isLoading={isSubmittingGoal || !!isPlanning}
        hasActiveGoal={!!activeGoal}
      />

      {isPlanning && <PlanningIndicator />}

      {hasPlan && activeGoal && (
        <PlanCard
          goal={activeGoal}
          decisions={decisions}
          onDispatch={handleDispatch}
          onReject={handleReject}
          onHold={handleHold}
          onDismiss={() => setActiveGoal(null)}
          onApproveAll={handleApproveAll}
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
