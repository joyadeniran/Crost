// lib/engine/supervisor.ts
// Orc's supervision pass — the stateless, serverless replacement for the old
// long-running scripts/worker.ts polling loop.
//
// Everything is derived from the database on each pass (no in-memory timers):
//   1. Reap tasks stuck in 'running' — bounded retries with exponential
//      backoff, then dead-letter to 'failed_permanent'.
//   2. Escalate stalled tasks (running > STALL_THRESHOLD_MS) once, via an
//      approval_queue notice.
//   3. For every executing goal: release dependency-resolved tasks and close
//      the goal (Mission Report) when every task is terminal.
//   4. Dispatch pending tasks that have no blocking dependencies.
//
// Normal progress is event-driven (dispatch → worker → CHAIN_REACTION); this
// pass is the safety net, invoked by Vercel Cron via /api/cron/supervise.
// Server-side ONLY.

import { createServerSupabaseClient } from '@/lib/supabase'
import { triggerDispatch } from '@/lib/background'

const STALL_THRESHOLD_MS = 5 * 60_000
const STALE_RESET_THRESHOLD_MS = 10 * 60_000
const MAX_TASK_RETRIES = 3
const RETRY_BASE_BACKOFF_MS = 30_000

const TERMINAL = new Set(['completed', 'failed', 'failed_permanent', 'rejected', 'expired', 'skipped'])
const RESOLVED = new Set(['completed', 'skipped'])

export interface SupervisorSummary {
  reaped: number
  deadLettered: number
  stalled: number
  released: number
  dispatchedPending: number
  closedGoals: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = ReturnType<typeof createServerSupabaseClient> & Record<string, any>

export function isDueForRetry(nextRetryAt: string | null | undefined, now = Date.now()): boolean {
  if (!nextRetryAt) return true
  return new Date(nextRetryAt).getTime() <= now
}

async function writeEvent(
  db: Db,
  eventType: string,
  description: string,
  goalId: string,
  createdBy: string | null,
  meta: Record<string, unknown> = {}
) {
  await db.from('event_log').insert({
    event_type: eventType,
    description,
    goal_id: goalId,
    department_slug: 'orchestrator',
    metadata: meta,
    created_by: createdBy,
  })
}

async function ownerOf(db: Db, goalId: string): Promise<string | null> {
  const { data } = await db.from('goals').select('created_by').eq('id', goalId).maybeSingle()
  return data?.created_by ?? null
}

async function reapStaleTasks(db: Db, summary: SupervisorSummary) {
  const staleCutoff = new Date(Date.now() - STALE_RESET_THRESHOLD_MS).toISOString()
  const { data: staleTasks } = await db
    .from('goal_tasks')
    .select('task_id, goal_id, label, dept_slug, retry_count, assigned_at')
    .eq('status', 'running')
    .lte('assigned_at', staleCutoff)

  for (const task of staleTasks ?? []) {
    const retryCount = task.retry_count ?? 0
    const owner = await ownerOf(db, task.goal_id)

    if (retryCount >= MAX_TASK_RETRIES) {
      await db.from('goal_tasks').update({
        status: 'failed_permanent',
        completed_at: new Date().toISOString(),
      }).eq('task_id', task.task_id).eq('goal_id', task.goal_id)
      await writeEvent(db, 'orc_task_dead_lettered',
        `Task "${task.label}" exceeded ${MAX_TASK_RETRIES} retries after repeated stalls — marked failed_permanent`,
        task.goal_id, owner, { task_id: task.task_id, dept_slug: task.dept_slug, retry_count: retryCount })
      summary.deadLettered++
      continue
    }

    const backoffMs = RETRY_BASE_BACKOFF_MS * Math.pow(2, retryCount)
    await db.from('goal_tasks').update({
      status: 'pending',
      retry_count: retryCount + 1,
      next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
    }).eq('task_id', task.task_id).eq('goal_id', task.goal_id)
    await writeEvent(db, 'orc_task_requeued',
      `Task "${task.label}" requeued after stalling (attempt ${retryCount + 1}/${MAX_TASK_RETRIES})`,
      task.goal_id, owner, { task_id: task.task_id, dept_slug: task.dept_slug, retry_count: retryCount + 1, backoff_ms: backoffMs })
    summary.reaped++
  }
}

async function escalateStalls(db: Db, summary: SupervisorSummary) {
  const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS).toISOString()
  const { data: running } = await db
    .from('goal_tasks')
    .select('task_id, goal_id, dept_slug, label, orc_notes')
    .eq('status', 'running')
    .lte('assigned_at', cutoff)

  for (const task of running ?? []) {
    const notes = (Array.isArray(task.orc_notes) ? task.orc_notes : []) as Array<{ action_taken?: string }>
    if (notes.some((n) => n?.action_taken === 'escalation_raised')) continue // once per task

    const owner = await ownerOf(db, task.goal_id)
    await db.from('goal_tasks').update({
      orc_notes: [...notes, {
        ts: new Date().toISOString(),
        note: `Department "${task.dept_slug}" stalled on task "${task.label}" — escalation raised after ${STALL_THRESHOLD_MS / 60_000} mins.`,
        action_taken: 'escalation_raised',
      }],
    }).eq('task_id', task.task_id).eq('goal_id', task.goal_id)

    await writeEvent(db, 'orc_stall_detected', `Stall detected: [${task.dept_slug}] "${task.label}"`,
      task.goal_id, owner, { task_id: task.task_id, dept_slug: task.dept_slug })

    await db.from('approval_queue').insert({
      department_name: 'Orchestrator',
      department_slug: 'orchestrator',
      action_type: 'other',
      action_label: `[Orc Escalation] Stalled: ${task.label}`,
      reasoning: `The ${task.dept_slug} department has not finished task "${task.label}" in ${STALL_THRESHOLD_MS / 60_000} mins. Review recommended.`,
      payload: { task_id: task.task_id, dept_slug: task.dept_slug, goal_id: task.goal_id },
      risk_level: 'medium',
      goal_id: task.goal_id,
      status: 'pending',
      created_by: owner,
    })
    summary.stalled++
  }
}

async function releaseDependents(db: Db, goalId: string, summary: SupervisorSummary) {
  const { data: blockedTasks } = await db
    .from('goal_tasks')
    .select('task_id, depends_on, next_retry_at')
    .eq('goal_id', goalId)
    .in('status', ['planned', 'pending'])

  for (const blocked of blockedTasks ?? []) {
    const deps = (blocked.depends_on as string[]) ?? []
    if (deps.length === 0 || !isDueForRetry(blocked.next_retry_at)) continue

    const { data: depTasks } = await db.from('goal_tasks').select('task_id, status')
      .eq('goal_id', goalId).in('task_id', deps)
    if (!(depTasks ?? []).every((d: { status: string }) => RESOLVED.has(d.status))) continue

    // Waterfall verification: completed deps must have posted their memo.
    const completedIds = (depTasks ?? []).filter((d: { status: string }) => d.status === 'completed')
      .map((d: { task_id: string }) => d.task_id)
    if (completedIds.length > 0) {
      const { data: memos } = await db.from('company_memos').select('task_id')
        .eq('goal_id', goalId).in('task_id', completedIds)
      const posted = new Set((memos ?? []).map((m: { task_id: string }) => m.task_id))
      if (!completedIds.every((id: string) => posted.has(id))) continue
    }

    triggerDispatch(goalId, blocked.task_id)
    summary.released++
  }
}

async function tryCloseGoal(db: Db, goalId: string, summary: SupervisorSummary) {
  const { data: goal } = await db.from('goals').select('id, status, created_by').eq('id', goalId).maybeSingle()
  if (!goal || goal.status !== 'executing') return

  const { data: tasks } = await db.from('goal_tasks').select('status').eq('goal_id', goalId)
  if (!tasks || tasks.length === 0) return
  if (!tasks.every((t: { status: string }) => TERMINAL.has(t.status))) return

  const failed = tasks.filter((t: { status: string }) => t.status === 'failed' || t.status === 'failed_permanent').length
  const done = tasks.filter((t: { status: string }) => t.status === 'completed').length
  const outcome = failed === 0 ? 'All tasks completed successfully.' : `${failed} failed, ${done} completed.`

  // Same synthesis the worker path uses (Mission Report memo + summary).
  const { runOrcReport } = await import('@/lib/llm-client')
  await runOrcReport(goalId)
  await db.from('goals').update({ status: 'completed', outcome }).eq('id', goalId)
  summary.closedGoals++
}

async function dispatchPending(db: Db, summary: SupervisorSummary) {
  const { data: pending } = await db
    .from('goal_tasks')
    .select('task_id, goal_id, depends_on, next_retry_at')
    .eq('status', 'pending')

  for (const task of pending ?? []) {
    const deps = (task.depends_on as string[]) ?? []
    if (deps.length > 0 || !isDueForRetry(task.next_retry_at)) continue
    triggerDispatch(task.goal_id, task.task_id)
    summary.dispatchedPending++
  }
}

export async function runSupervisor(): Promise<SupervisorSummary> {
  const db = createServerSupabaseClient() as Db
  const summary: SupervisorSummary = {
    reaped: 0, deadLettered: 0, stalled: 0, released: 0, dispatchedPending: 0, closedGoals: 0,
  }

  await escalateStalls(db, summary)
  await reapStaleTasks(db, summary)

  const { data: executing } = await db.from('goals').select('id').eq('status', 'executing')
  for (const goal of executing ?? []) {
    await releaseDependents(db, goal.id, summary)
    await tryCloseGoal(db, goal.id, summary)
  }

  await dispatchPending(db, summary)
  return summary
}
