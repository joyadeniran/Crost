/**
 * Unit tests: lib/state-machine.ts (Phase 3 — 10x rebuild).
 * Characterization tests: assert what the transition tables encode today,
 * derived from what app code actually does (see file header comments for
 * the grep trail behind each edge).
 */
import { describe, it, expect } from 'vitest'
import {
  isValidGoalTransition,
  isValidGoalTaskTransition,
  isValidApprovalTransition,
  isValidArtifactTransition,
  isGoalTerminal,
  isGoalTaskTerminal,
  isApprovalTerminal,
  isArtifactImmutable,
  GOAL_TERMINAL_STATUSES,
  GOAL_TASK_TERMINAL_STATUSES,
  APPROVAL_TERMINAL_STATUSES,
  ARTIFACT_IMMUTABLE_STATUSES,
  type GoalStatus,
  type GoalTaskStatus,
  type ApprovalStatus,
  type ArtifactStatus,
} from '@/lib/state-machine'

describe('goals transitions', () => {
  it('allows planning -> clarifying (dialogue mode)', () => {
    expect(isValidGoalTransition('planning', 'clarifying')).toBe(true)
  })

  it('allows clarifying -> planning (founder answered)', () => {
    expect(isValidGoalTransition('clarifying', 'planning')).toBe(true)
  })

  it('allows planning -> awaiting_approval (orchestrator produced a valid plan)', () => {
    expect(isValidGoalTransition('planning', 'awaiting_approval')).toBe(true)
  })

  it('allows awaiting_approval -> executing (dispatch route TOCTOU-guarded claim)', () => {
    expect(isValidGoalTransition('awaiting_approval', 'executing')).toBe(true)
  })

  it('rejects pending -> executing (skips planning/approval entirely)', () => {
    expect(isValidGoalTransition('pending', 'executing')).toBe(false)
  })

  it('allows planning -> error (hallucination-retry-exhausted path)', () => {
    expect(isValidGoalTransition('planning', 'error')).toBe(true)
  })

  it('rejects completed -> error (error only reachable from planning today)', () => {
    expect(isValidGoalTransition('completed', 'error')).toBe(false)
  })

  it('allows cancelled from any non-terminal status (founder manual cancel is unguarded)', () => {
    expect(isValidGoalTransition('pending', 'cancelled')).toBe(true)
    expect(isValidGoalTransition('executing', 'cancelled')).toBe(true)
    expect(isValidGoalTransition('clarifying', 'cancelled')).toBe(true)
  })

  it('allows failed from any status (goals/route.ts POST error handler is unguarded)', () => {
    expect(isValidGoalTransition('pending', 'failed')).toBe(true)
    expect(isValidGoalTransition('planning', 'failed')).toBe(true)
  })

  it('flags every terminal status', () => {
    const terminal: GoalStatus[] = ['completed', 'failed', 'error', 'cancelled']
    terminal.forEach((s) => expect(isGoalTerminal(s)).toBe(true))
    expect(isGoalTerminal('pending')).toBe(false)
    expect(isGoalTerminal('executing')).toBe(false)
  })

  it('GOAL_TERMINAL_STATUSES matches isGoalTerminal for every known status', () => {
    const all: GoalStatus[] = ['pending', 'clarifying', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed', 'error', 'cancelled']
    all.forEach((s) => expect(isGoalTerminal(s)).toBe(GOAL_TERMINAL_STATUSES.includes(s)))
  })
})

describe('goal_tasks transitions', () => {
  it('allows pending -> running (atomic claim in dispatch route)', () => {
    expect(isValidGoalTaskTransition('pending', 'running')).toBe(true)
  })

  it('allows planned -> running (claim after dependency became satisfied)', () => {
    expect(isValidGoalTaskTransition('planned', 'running')).toBe(true)
  })

  it('rejects completed -> running (already-claimed tasks cannot be re-claimed)', () => {
    expect(isValidGoalTaskTransition('completed', 'running')).toBe(false)
  })

  it('allows running -> completed and running -> failed (worker outcome mapping)', () => {
    expect(isValidGoalTaskTransition('running', 'completed')).toBe(true)
    expect(isValidGoalTaskTransition('running', 'failed')).toBe(true)
  })

  it('allows pending -> planned (dispatch route resets on unmet dependency)', () => {
    expect(isValidGoalTaskTransition('pending', 'planned')).toBe(true)
  })

  it('rejects transitions into approved/dispatched/needs_data (no observed writer in app code)', () => {
    // These values exist in the DB CHECK constraint but nothing in the
    // codebase currently writes them — characterized as unreachable.
    expect(isValidGoalTaskTransition('pending', 'approved')).toBe(false)
    expect(isValidGoalTaskTransition('pending', 'dispatched')).toBe(false)
    expect(isValidGoalTaskTransition('pending', 'needs_data')).toBe(false)
  })

  it('allows rejected from any status (founder reject / cancel cascade / approval rejection are all unguarded)', () => {
    expect(isValidGoalTaskTransition('pending', 'rejected')).toBe(true)
    expect(isValidGoalTaskTransition('running', 'rejected')).toBe(true)
    expect(isValidGoalTaskTransition('completed', 'rejected')).toBe(true)
  })

  it('flags every terminal status', () => {
    const terminal: GoalTaskStatus[] = ['completed', 'failed', 'rejected', 'skipped', 'expired']
    terminal.forEach((s) => expect(isGoalTaskTerminal(s)).toBe(true))
    expect(isGoalTaskTerminal('pending')).toBe(false)
    expect(isGoalTaskTerminal('running')).toBe(false)
  })

  it('GOAL_TASK_TERMINAL_STATUSES matches isGoalTaskTerminal for every known status', () => {
    const all: GoalTaskStatus[] = ['pending', 'planned', 'approved', 'pending_dependency', 'dispatched', 'running', 'completed', 'failed', 'rejected', 'skipped', 'expired', 'needs_data']
    all.forEach((s) => expect(isGoalTaskTerminal(s)).toBe(GOAL_TASK_TERMINAL_STATUSES.includes(s)))
  })
})

describe('approval_queue transitions', () => {
  it('allows pending -> approved and pending -> rejected (founder PATCH decision)', () => {
    expect(isValidApprovalTransition('pending', 'approved')).toBe(true)
    expect(isValidApprovalTransition('pending', 'rejected')).toBe(true)
  })

  it('rejects a second decision on an already-decided approval (mirrors the route\'s 409 guard)', () => {
    expect(isValidApprovalTransition('approved', 'approved')).toBe(false)
    expect(isValidApprovalTransition('rejected', 'approved')).toBe(false)
  })

  it('allows approved -> executed and approved -> failed (post-approval execution outcome)', () => {
    expect(isValidApprovalTransition('approved', 'executed')).toBe(true)
    expect(isValidApprovalTransition('approved', 'failed')).toBe(true)
  })

  it('rejects executed -> failed (execution outcome is one-shot)', () => {
    expect(isValidApprovalTransition('executed', 'failed')).toBe(false)
  })

  it('allows pending -> expired (24h/expires_at cron sweep)', () => {
    expect(isValidApprovalTransition('pending', 'expired')).toBe(true)
  })

  it('flags every terminal status', () => {
    const terminal: ApprovalStatus[] = ['executed', 'failed', 'expired']
    terminal.forEach((s) => expect(isApprovalTerminal(s)).toBe(true))
    expect(isApprovalTerminal('pending')).toBe(false)
    expect(isApprovalTerminal('approved')).toBe(false)
  })

  it('APPROVAL_TERMINAL_STATUSES matches isApprovalTerminal for every known status', () => {
    const all: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'executed', 'failed', 'expired']
    all.forEach((s) => expect(isApprovalTerminal(s)).toBe(APPROVAL_TERMINAL_STATUSES.includes(s)))
  })
})

describe('artifacts transitions (mirrors enforce_artifact_status_transition DB trigger)', () => {
  it('allows draft -> review -> active (normal publish flow)', () => {
    expect(isValidArtifactTransition('draft', 'review')).toBe(true)
    expect(isValidArtifactTransition('review', 'active')).toBe(true)
  })

  it('rejects active -> discarded (trigger: use deprecated for published artifacts)', () => {
    expect(isValidArtifactTransition('active', 'discarded')).toBe(false)
  })

  it('rejects paused -> discarded and deprecated -> discarded', () => {
    expect(isValidArtifactTransition('paused', 'discarded')).toBe(false)
    expect(isValidArtifactTransition('deprecated', 'discarded')).toBe(false)
  })

  it('rejects draft -> deprecated and review -> deprecated (trigger: use discarded for unpublished artifacts)', () => {
    expect(isValidArtifactTransition('draft', 'deprecated')).toBe(false)
    expect(isValidArtifactTransition('review', 'deprecated')).toBe(false)
  })

  it('allows active -> deprecated and paused -> deprecated', () => {
    expect(isValidArtifactTransition('active', 'deprecated')).toBe(true)
    expect(isValidArtifactTransition('paused', 'deprecated')).toBe(true)
  })

  it('allows draft -> discarded and review -> discarded', () => {
    expect(isValidArtifactTransition('draft', 'discarded')).toBe(true)
    expect(isValidArtifactTransition('review', 'discarded')).toBe(true)
  })

  it('allows active -> paused and paused -> active', () => {
    expect(isValidArtifactTransition('active', 'paused')).toBe(true)
    expect(isValidArtifactTransition('paused', 'active')).toBe(true)
  })

  it('flags active/paused/deprecated as immutable, draft/review/discarded as not', () => {
    const immutable: ArtifactStatus[] = ['active', 'paused', 'deprecated']
    const mutable: ArtifactStatus[] = ['draft', 'review', 'discarded']
    immutable.forEach((s) => expect(isArtifactImmutable(s)).toBe(true))
    mutable.forEach((s) => expect(isArtifactImmutable(s)).toBe(false))
  })

  it('ARTIFACT_IMMUTABLE_STATUSES matches isArtifactImmutable for every known status', () => {
    const all: ArtifactStatus[] = ['draft', 'review', 'active', 'paused', 'deprecated', 'discarded']
    all.forEach((s) => expect(isArtifactImmutable(s)).toBe(ARTIFACT_IMMUTABLE_STATUSES.includes(s)))
  })
})
