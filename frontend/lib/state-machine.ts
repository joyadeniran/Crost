// lib/state-machine.ts
// Status transition tables for goals, goal_tasks, approval_queue, artifacts
// (Phase 3, 10x rebuild).
//
// CHARACTERIZATION, NOT ASPIRATION: every edge below was reverse-engineered
// from what the application code actually does today (grepped across
// app/api/**, lib/engine/**, lib/tools/**, scripts/worker.ts, and the Deno
// edge function), cross-checked against the live Cloud SQL CHECK constraints
// and the `artifacts` DB trigger (enforce_artifact_status_transition in
// cloudsql_migration.sql). Where the code takes a shortcut (e.g. writes a
// status without checking the prior value), that is modeled as an edge FROM
// ANY_STATUS rather than invented as a "should be" restriction — tightening
// those is a follow-up product decision, not something to sneak in here.
//
// Only `artifacts` has DB-level transition enforcement (BEFORE UPDATE
// trigger). `goals`, `goal_tasks`, `approval_queue` only have CHECK
// constraints on valid values, no transition guard — so `isValidTransition`
// below is currently the ONLY enforcement for those three tables. It exists
// so route/worker code has one place to ask "is this move legal" — it does
// not itself change any behavior until something calls it.
//
// Schema drift note (fixed 2026-07-02, cloudsql_fixes_v13.17.sql): goals'
// live CHECK constraint was missing 'clarifying' and 'error' even though
// lib/engine/orchestrator.ts writes both in normal code paths. That gap is
// now closed at the DB level; this file reflects the corrected vocabulary.

export type GoalStatus =
  | 'pending'
  | 'clarifying'
  | 'planning'
  | 'awaiting_approval'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'error'
  | 'cancelled'

export type GoalTaskStatus =
  | 'pending'
  | 'planned'
  | 'approved'
  | 'pending_dependency'
  | 'dispatched'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'skipped'
  | 'expired'
  | 'needs_data'

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'expired'

export type ArtifactStatus =
  | 'draft'
  | 'review'
  | 'active'
  | 'paused'
  | 'deprecated'
  | 'discarded'

export const GOAL_TERMINAL_STATUSES: readonly GoalStatus[] = ['completed', 'failed', 'error', 'cancelled']
export const GOAL_TASK_TERMINAL_STATUSES: readonly GoalTaskStatus[] = ['completed', 'failed', 'rejected', 'skipped', 'expired']
export const APPROVAL_TERMINAL_STATUSES: readonly ApprovalStatus[] = ['executed', 'failed', 'expired']
export const ARTIFACT_IMMUTABLE_STATUSES: readonly ArtifactStatus[] = ['active', 'paused', 'deprecated']

// A sentinel meaning "the code writes this status unconditionally / without
// checking the prior value" — i.e. every status is a legal predecessor as
// observed in the codebase today. NOT the same as "any transition SHOULD be
// allowed" — see the per-table notes above each table for which edges are
// characterized-loose vs. characterized-guarded.
const ANY_STATUS = Symbol('ANY_STATUS')
type FromSet<S extends string> = readonly S[] | typeof ANY_STATUS

function fromIncludes<S extends string>(from: FromSet<S>, status: S): boolean {
  return from === ANY_STATUS || (from as readonly S[]).includes(status)
}

// ─── GOALS ──────────────────────────────────────────────────────────────────
// Four different entry points create a goal directly into 'pending',
// 'planning', or 'executing' (goals/route.ts, onboarding/first-goal,
// cron/recurring-missions, adk/route.ts, departments/[slug]/task synthetic
// goal) — modeled as inserts, not transitions, so they aren't edges here.
// 'cancelled' is a founder-initiated terminal action from any non-terminal
// status (app/api/goals/[id]/route.ts PATCH) — modeled as ANY_STATUS since
// the route does not gate it on current status today.
const GOAL_TRANSITIONS: Record<GoalStatus, FromSet<GoalStatus>> = {
  pending: [],
  clarifying: ['pending', 'planning'],
  planning: ['pending', 'clarifying'],
  awaiting_approval: ['planning', 'clarifying'],
  executing: ['awaiting_approval'],
  completed: ['executing', 'awaiting_approval', 'planning'], // manual PATCH + direct_response + synthetic single-dept path all skip strict prior-state checks
  failed: ANY_STATUS, // goals/route.ts POST error handler — can fire before a status was ever set to a "later" stage
  error: ['planning'], // orchestrator.ts hallucination-retry-exhausted path
  cancelled: ANY_STATUS, // founder manual cancel, any time before terminal
}

// ─── GOAL_TASKS ─────────────────────────────────────────────────────────────
// 'approved', 'dispatched', 'needs_data' appear in the DB CHECK constraint
// but were NOT found written anywhere in current app code — flagged as
// characterized-absent, not modeled as reachable edges. If a future
// integration needs them, this table should be extended alongside that work,
// not guessed at now.
const GOAL_TASK_TRANSITIONS: Record<GoalTaskStatus, FromSet<GoalTaskStatus>> = {
  pending: [],
  planned: ['pending'], // dispatch route resets a task to 'planned' when its dependency isn't satisfied yet
  approved: [],          // no observed writer — reserved by CHECK constraint, unused by current code
  pending_dependency: [],
  dispatched: [],         // no observed writer — reserved by CHECK constraint, unused by current code
  running: ['pending', 'planned'], // atomic claim upsert in dispatch route, guarded by NOT IN CLAIMED_STATUSES
  completed: ['running', 'pending'], // worker result mapping + founder manual + approval-executed path
  failed: ['running', 'pending'], // worker failure, uncaught exception, pre-claim throw
  rejected: ANY_STATUS, // founder reject, goal-cancel cascade (WHERE NOT IN terminal), approval rejected — none check the prior task status
  skipped: ['pending', 'planned'], // founder manual skip
  expired: ['pending', 'planned', 'pending_dependency'], // Deno edge function cron only — no equivalent Next.js route (see note below)
  needs_data: [],
}
// GAP (characterization finding, not fixed here): goal_tasks.expired is only
// ever written by supabase/functions/expire-approvals (a Deno edge function
// tied to the pre-Cloud-SQL Supabase stack). There is no Next.js/Cloud Run
// equivalent — confirm with the team whether that edge function is still
// deployed; if not, stale goal_tasks can never reach 'expired' in production
// today. Same open question applies to approval_queue's dual expiry below.

// ─── APPROVAL_QUEUE ─────────────────────────────────────────────────────────
// Two independent expiry mechanisms were found: app/api/approvals/expire
// (Next.js cron, WHERE requested_at < 24h) and supabase/functions/expire-
// approvals (Deno edge function, WHERE expires_at < now). Both are modeled
// as valid writers of 'expired' below since either could be the live one —
// this file does not resolve which is actually deployed; see the open items
// this session raised. The PATCH decision route already enforces
// `status !== 'pending' -> 409` at the app layer before allowing
// approved/rejected — mirrored here as the from-set.
const APPROVAL_TRANSITIONS: Record<ApprovalStatus, FromSet<ApprovalStatus>> = {
  pending: [],
  approved: ['pending'],
  rejected: ['pending'],
  executed: ['approved'],
  failed: ['approved'], // execution threw after approval
  expired: ['pending'],
}

// ─── ARTIFACTS ──────────────────────────────────────────────────────────────
// DB-enforced via enforce_artifact_status_transition() trigger
// (cloudsql_migration.sql:469-499) — this table mirrors that trigger's
// rules exactly (and app/api/artifacts/[id]/route.ts fails the same checks
// fast, before hitting the DB, then catches the trigger's error message as a
// 409 fallback). Two structural rules the trigger enforces that a simple
// from-set table can't fully express, kept here as free-text so nobody
// "fixes" this table into contradicting the DB:
//   1. active -> active is allowed only if title/file_url/body/metadata/
//      version are all unchanged (i.e. non-field-mutating no-op updates).
//      Any field change on an active artifact must go through a NEW VERSION,
//      not a same-status update — the trigger raises on that case.
//   2. Any transition INTO 'active' (from a non-active status) stamps
//      published_at := NOW() as a side effect.
const ARTIFACT_TRANSITIONS: Record<ArtifactStatus, FromSet<ArtifactStatus>> = {
  draft: [],
  review: ['draft'],
  active: ['review', 'draft', 'paused', 'active'], // active->active only legal as a no-field-change no-op — see note above, not expressible as a plain edge
  paused: ['active'],
  deprecated: ['active', 'paused'], // blocked from draft/review by the trigger
  discarded: ['draft', 'review'],   // blocked from active/paused/deprecated by the trigger — "use deprecated instead"
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function isValidGoalTransition(from: GoalStatus, to: GoalStatus): boolean {
  return fromIncludes(GOAL_TRANSITIONS[to], from)
}

export function isValidGoalTaskTransition(from: GoalTaskStatus, to: GoalTaskStatus): boolean {
  return fromIncludes(GOAL_TASK_TRANSITIONS[to], from)
}

export function isValidApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return fromIncludes(APPROVAL_TRANSITIONS[to], from)
}

export function isValidArtifactTransition(from: ArtifactStatus, to: ArtifactStatus): boolean {
  return fromIncludes(ARTIFACT_TRANSITIONS[to], from)
}

export function isGoalTerminal(status: GoalStatus): boolean {
  return GOAL_TERMINAL_STATUSES.includes(status)
}

export function isGoalTaskTerminal(status: GoalTaskStatus): boolean {
  return GOAL_TASK_TERMINAL_STATUSES.includes(status)
}

export function isApprovalTerminal(status: ApprovalStatus): boolean {
  return APPROVAL_TERMINAL_STATUSES.includes(status)
}

export function isArtifactImmutable(status: ArtifactStatus): boolean {
  return ARTIFACT_IMMUTABLE_STATUSES.includes(status)
}
