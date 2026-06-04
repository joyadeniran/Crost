#!/usr/bin/env tsx
// scripts/worker.ts
// Orc's supervision worker — migrated to Google Cloud SQL (pg).
//
// Architecture: Polling-primary (Supabase Realtime removed — GCP migration)
//   - A 15-second poll loop is the PRIMARY supervision engine
//   - Adaptive backoff: 15s when active, 5 min when idle
//
// Responsibilities:
//   1. Polling supervisor — watchdog sync, dependency unblocking, goal closure, pending dispatch.
//   2. In-memory stall detection (Watchdog Timers).
//   3. Goal closure and Mission Report generation.
//   4. Multi-tenant context preservation.

import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const localEnvPath = path.resolve(process.cwd(), 'frontend/.env.local')
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath })
} else {
  dotenv.config()
}

const DATABASE_URL = process.env.DATABASE_URL ?? ''
const STALL_THRESHOLD_MS    = 5 * 60_000   // 5 minutes = stalled
const POLL_INTERVAL_ACTIVE  = 15_000       // 15 s when work is in-flight
const POLL_INTERVAL_IDLE    = 5 * 60_000   // 5 min when nothing is executing

if (!DATABASE_URL) {
  console.error('[worker] DATABASE_URL is required.')
  process.exit(1)
}

console.log('[worker] Connecting to Cloud SQL PostgreSQL...')

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
})

pool.on('error', (err) => console.error('[worker] Pool error:', err))

// Supabase-compatible query builder shim for the worker
const supabase = {
  from: (table: string) => {
    const state: {
      cols: string; wheres: string[]; vals: unknown[]; orders: string[];
      limitN: number; insertData: any; updateData: any; upsertData: any;
      upsertConflict: string; isDelete: boolean; isSingle: boolean; isMaybe: boolean;
    } = { cols: '*', wheres: [], vals: [], orders: [], limitN: 1000, insertData: null, updateData: null, upsertData: null, upsertConflict: 'id', isDelete: false, isSingle: false, isMaybe: false }
    const b: any = {
      select(c = '*') { state.cols = c; return b },
      eq(col: string, val: unknown) { state.vals.push(val); state.wheres.push(`"${col}" = $${state.vals.length}`); return b },
      neq(col: string, val: unknown) { state.vals.push(val); state.wheres.push(`"${col}" != $${state.vals.length}`); return b },
      is(col: string, val: null | boolean) { state.wheres.push(val === null ? `"${col}" IS NULL` : `"${col}" IS ${val ? 'TRUE' : 'FALSE'}`); return b },
      in(col: string, vals: unknown[]) {
        if (!vals.length) { state.wheres.push('FALSE'); return b }
        const ph = vals.map(v => { state.vals.push(v); return `$${state.vals.length}` })
        state.wheres.push(`"${col}" IN (${ph.join(',')})`)
        return b
      },
      gte(col: string, val: unknown) { state.vals.push(val); state.wheres.push(`"${col}" >= $${state.vals.length}`); return b },
      lte(col: string, val: unknown) { state.vals.push(val); state.wheres.push(`"${col}" <= $${state.vals.length}`); return b },
      order(col: string, opts: { ascending?: boolean } = {}) { state.orders.push(`"${col}" ${opts.ascending === false ? 'DESC' : 'ASC'}`); return b },
      limit(n: number) { state.limitN = n; return b },
      single() { state.isSingle = true; return b },
      maybeSingle() { state.isMaybe = true; return b },
      insert(d: any) { state.insertData = d; return b },
      update(d: any) { state.updateData = d; return b },
      upsert(d: any, opts: { onConflict?: string } = {}) { state.upsertData = Array.isArray(d) ? d : [d]; state.upsertConflict = opts.onConflict ?? 'id'; return b },
      delete() { state.isDelete = true; return b },
      async then(resolve: any, reject: any) {
        try {
          const wh = state.wheres.length ? `WHERE ${state.wheres.join(' AND ')}` : ''
          const od = state.orders.length ? `ORDER BY ${state.orders.join(', ')}` : ''
          if (state.insertData) {
            const row = state.insertData
            const cols = Object.keys(row)
            const ph = cols.map((_, i) => `$${i + 1}`)
            const r = await pool.query(`INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${ph.join(',')}) RETURNING *`, cols.map(c => row[c]))
            return resolve({ data: state.isSingle || state.isMaybe ? r.rows[0] ?? null : r.rows, error: null })
          }
          if (state.upsertData) {
            const rows = state.upsertData
            const results = []
            for (const row of rows) {
              const cols = Object.keys(row)
              const ph = cols.map((_, i) => `$${i + 1}`)
              const cc = state.upsertConflict.split(',').map((s: string) => s.trim())
              const uc = cols.filter((c: string) => !cc.includes(c))
              const us = uc.length ? `DO UPDATE SET ${uc.map((c: string) => `"${c}" = EXCLUDED."${c}"`).join(',')}` : 'DO NOTHING'
              const r = await pool.query(`INSERT INTO "${table}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${ph.join(',')}) ON CONFLICT (${cc.map((c: string) => `"${c}"`).join(',')}) ${us} RETURNING *`, cols.map(c => row[c]))
              results.push(r.rows[0])
            }
            return resolve({ data: state.isSingle || state.isMaybe ? results[0] ?? null : results, error: null })
          }
          if (state.updateData) {
            const cols = Object.keys(state.updateData)
            const set = cols.map((c, i) => `"${c}" = $${i + 1}`).join(',')
            const adj = state.wheres.map(w => w.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + cols.length}`))
            const adjWh = adj.length ? `WHERE ${adj.join(' AND ')}` : ''
            const r = await pool.query(`UPDATE "${table}" SET ${set} ${adjWh} RETURNING *`, [...cols.map(c => (state.updateData as any)[c]), ...state.vals])
            return resolve({ data: r.rows, error: null })
          }
          if (state.isDelete) {
            const r = await pool.query(`DELETE FROM "${table}" ${wh} RETURNING *`, state.vals)
            return resolve({ data: r.rows, error: null })
          }
          const r = await pool.query(`SELECT ${state.cols} FROM "${table}" ${wh} ${od} LIMIT ${state.limitN}`, state.vals)
          if (state.isSingle) return resolve({ data: r.rows[0] ?? null, error: r.rows.length === 0 ? new Error('Not found') : null })
          if (state.isMaybe) return resolve({ data: r.rows[0] ?? null, error: null })
          return resolve({ data: r.rows, error: null })
        } catch (err) {
          console.error(`[worker] DB error on ${table}:`, err)
          return resolve({ data: null, error: err })
        }
      }
    }
    return b
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

// taskId -> NodeJS.Timeout
// Tracks tasks currently in flight to detect stalls without polling.
const activeWatchdogs = new Map<string, NodeJS.Timeout>()

// Tracks tasks already dispatched in this poll cycle to avoid double-dispatch
const recentlyDispatched = new Set<string>()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string, meta?: any) {
  console.log(`[orc-worker][${new Date().toISOString()}] ${msg}`, meta ?? '')
}

async function writeEvent(
  eventType: string,
  description: string,
  goalId?: string,
  meta?: Record<string, unknown>
) {
  // Fetch goal owner for multi-tenant safety
  let createdBy: string | null = null
  if (goalId) {
    const { data } = await supabase.from('goals').select('created_by').eq('id', goalId).single()
    createdBy = data?.created_by || null
  }

  await supabase.from('event_log').insert({
    event_type: eventType,
    description,
    goal_id: goalId ?? null,
    department_slug: 'orchestrator',
    metadata: meta ?? {},
    created_by: createdBy
  })
}

// ─── Mission Report memo ───────────────────────────────────────────────────────

async function writeMissionReportMemo(
  goalId: string,
  founderInput: string,
  tasks: any[]
) {
  const completed = tasks.filter(t => t.status === 'completed')
  const failed    = tasks.filter(t => t.status === 'failed')
  const rejected  = tasks.filter(t => t.status === 'rejected')

  const body = [
    `Goal: "${founderInput}"`,
    '',
    `Outcome: ${completed.length} tasks completed, ${failed.length} failed, ${rejected.length} rejected.`,
    '',
    completed.length > 0 ? `Completed:\n${completed.map((t: any) => `  - [${t.dept_slug}] ${t.label}`).join('\n')}` : '',
    failed.length > 0    ? `Failed:\n${failed.map((t: any) => `  - [${t.dept_slug}] ${t.label}`).join('\n')}` : '',
    rejected.length > 0  ? `Rejected by founder:\n${rejected.map((t: any) => `  - [${t.dept_slug}] ${t.label}`).join('\n')}` : '',
    '',
    `Mission Report written by Orc at ${new Date().toISOString()}.`,
  ].filter((l: string) => l !== '').join('\n')

  const { data: goal } = await supabase.from('goals').select('created_by').eq('id', goalId).single()

  await supabase.from('company_memos').insert({
    goal_id: goalId,
    from_department: 'orchestrator',
    title: `[Mission Report] ${founderInput.slice(0, 80)}`,
    body,
    tags: ['mission-report', 'orc', 'goal'],
    priority: failed.length > 0 ? 'high' : 'normal',
    source_type: 'orchestrator',
    confidence: 1.0,
    created_by: goal?.created_by
  })

  await writeEvent('goal_mission_report_written', `Mission Report written for goal "${founderInput.slice(0, 60)}"`, goalId)
}

// ─── Stall logic (The Watchdog) ───────────────────────────────────────────────

function clearWatchdog(taskId: string) {
  const existing = activeWatchdogs.get(taskId)
  if (existing) {
    clearTimeout(existing)
    activeWatchdogs.delete(taskId)
    log(`Watchdog cleared for task: ${taskId}`)
  }
}

async function handleStall(taskId: string, goalId: string) {
  log(`STALL TRIGGERED for task: ${taskId} (Goal: ${goalId})`)
  
  const { data: task } = await supabase
    .from('goal_tasks')
    .select('dept_slug, label, orc_notes')
    .eq('task_id', taskId)
    .eq('goal_id', goalId)
    .single()

  if (!task) return

  const notes = (task.orc_notes as Array<any>) ?? []
  notes.push({
    ts: new Date().toISOString(),
    note: `Department "${task.dept_slug}" stalled on task "${task.label}" — escalation raised after ${STALL_THRESHOLD_MS / 60_000} mins.`,
    action_taken: 'escalation_raised',
  })

  await supabase.from('goal_tasks').update({ orc_notes: notes }).eq('task_id', taskId).eq('goal_id', goalId)

  await writeEvent(
    'orc_stall_detected',
    `Stall detected: [${task.dept_slug}] "${task.label}"`,
    goalId,
    { task_id: taskId, dept_slug: task.dept_slug }
  )

  const { data: goal } = await supabase.from('goals').select('created_by').eq('id', goalId).single()

  await supabase.from('approval_queue').insert({
    department_name: 'Orchestrator',
    department_slug: 'orchestrator',
    action_type: 'other',
    action_label: `[Orc Escalation] Stalled: ${task.label}`,
    reasoning: `The ${task.dept_slug} department has not finished task "${task.label}" in ${STALL_THRESHOLD_MS / 60_000} mins. Review recommended.`,
    payload: { task_id: taskId, dept_slug: task.dept_slug, goal_id: goalId },
    risk_level: 'medium',
    goal_id: goalId,
    status: 'pending',
    created_by: goal?.created_by
  })
}

function startWatchdog(taskId: string, goalId: string) {
  clearWatchdog(taskId)
  log(`Watchdog started for task: ${taskId} (${STALL_THRESHOLD_MS / 60_000}m limit)`)
  const timeout = setTimeout(() => handleStall(taskId, goalId), STALL_THRESHOLD_MS)
  activeWatchdogs.set(taskId, timeout)
}

// ─── Goal Management ──────────────────────────────────────────────────────────

async function unblockDependentTasks(goalId: string) {
  const { data: blockedTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, dept_slug, label, depends_on')
    .eq('goal_id', goalId)
    .in('status', ['planned', 'pending']) // Process both planned and pending with dependencies

  for (const blocked of blockedTasks ?? []) {
    const dependencies = blocked.depends_on as string[] || []
    if (dependencies.length === 0) continue

    // 1. Check if all dependent tasks are 'completed' or 'skipped'
    const { data: depTasks } = await supabase
      .from('goal_tasks')
      .select('task_id, status')
      .eq('goal_id', goalId)
      .in('task_id', dependencies)

    const RESOLVED_STATUSES = new Set(['completed', 'skipped'])
    const allTasksResolved = (depTasks ?? []).every((d: any) => RESOLVED_STATUSES.has(d.status))
    if (!allTasksResolved) continue

    // 2. Waterfall Verification: Ensure 'completed' dependencies have posted memos.
    // 'skipped' tasks obviously won't have memos, so we don't wait for them.
    const completedDepIds = (depTasks ?? []).filter((d: any) => d.status === 'completed').map((d: any) => d.task_id)
    
    if (completedDepIds.length > 0) {
      const { data: memos } = await supabase
        .from('company_memos')
        .select('task_id')
        .eq('goal_id', goalId)
        .in('task_id', completedDepIds)

      const postedMemos = new Set((memos ?? []).map(m => m.task_id))
      const allCompletedMemosExist = completedDepIds.every(depId => postedMemos.has(depId))

      if (!allCompletedMemosExist) {
        const missing = completedDepIds.filter(id => !postedMemos.has(id))
        log(`Task "${blocked.task_id}" still waiting for memos from completed tasks: ${missing.join(', ')}`, { goalId })
        continue
      }
    }

    // If we reach here, all deps are either skipped or completed-with-memos.
    await dispatchTask(blocked.task_id, goalId)
    log(`Dependencies resolved — auto-dispatching task "${blocked.task_id}"`, { goalId })
    await writeEvent('orc_rebalance', `Task "${blocked.label}" auto-dispatched after dependency resolution (completed/skipped)`, goalId)
  }
}

async function tryCloseGoal(goalId: string) {
  const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
  if (!goal || goal.status !== 'executing') return

  const { data: tasks } = await supabase.from('goal_tasks').select('*').eq('goal_id', goalId)
  if (!tasks || tasks.length === 0) return

  const terminalStatuses = new Set(['completed', 'failed', 'rejected', 'expired', 'skipped'])
  const allTerminal = tasks.every(t => terminalStatuses.has(t.status))
  if (!allTerminal) return

  const allSucceeded = tasks.every(t => t.status === 'completed' || t.status === 'skipped')
  const outcome = allSucceeded 
    ? 'All tasks completed successfully.' 
    : `${tasks.filter(t => t.status === 'failed').length} failed, ${tasks.filter(t => t.status === 'completed').length} completed.`

  await writeMissionReportMemo(goalId, goal.founder_input, tasks)
  await supabase.from('goals').update({ status: 'completed', outcome }).eq('id', goalId)
  log(`Goal closed: ${goalId}`)
}

// ─── Dispatch helper ──────────────────────────────────────────────────────────

async function dispatchTask(taskId: string, goalId: string) {
  if (recentlyDispatched.has(taskId)) {
    log(`[Dispatch] Skipping already-dispatched task: ${taskId}`)
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    log('[Dispatch] NEXT_PUBLIC_APP_URL missing — cannot auto-dispatch tasks')
    return
  }

  recentlyDispatched.add(taskId)
  // Remove from recently dispatched after 60s (prevents memory leak, allows re-dispatch if truly needed)
  setTimeout(() => recentlyDispatched.delete(taskId), 60_000)

  fetch(`${appUrl}/api/goals/${goalId}/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-crost-internal-secret': SUPABASE_SERVICE_KEY
    },
    body: JSON.stringify({ task_id: taskId })
  }).catch((e) => log(`[Dispatch] fetch failed for task ${taskId}`, e))
}

// ─── Polling Supervisor (Primary Engine) ──────────────────────────────────────

async function pollSupervisor() {
  try {
    log('[Poll] Supervisor cycle starting...')

    // 1. Sync watchdogs with actual DB state
    const { data: runningTasks } = await supabase
      .from('goal_tasks')
      .select('task_id, goal_id')
      .eq('status', 'running')

    const runningIds = new Set((runningTasks ?? []).map(t => t.task_id))

    // Arm watchdogs for running tasks that don't have one
    for (const task of runningTasks ?? []) {
      if (!activeWatchdogs.has(task.task_id)) {
        log(`[Poll] Re-arming watchdog for running task: ${task.task_id}`)
        startWatchdog(task.task_id, task.goal_id)
      }
    }

    // Clear stale watchdogs for tasks no longer running
    for (const [taskId] of activeWatchdogs) {
      if (!runningIds.has(taskId)) {
        log(`[Poll] Clearing stale watchdog for completed/failed task: ${taskId}`)
        clearWatchdog(taskId)
      }
    }

    // 2. Supervise all executing goals
    const { data: executingGoals } = await supabase
      .from('goals')
      .select('id')
      .eq('status', 'executing')

    for (const goal of executingGoals ?? []) {
      await unblockDependentTasks(goal.id)
      await tryCloseGoal(goal.id)
    }

    // 3. Dispatch pending tasks with no blocking dependencies
    //    (covers tasks that weren't dispatched when the plan was approved)
    const { data: pendingTasks } = await supabase
      .from('goal_tasks')
      .select('task_id, goal_id, depends_on, label, status')
      .eq('status', 'pending')

    for (const task of pendingTasks ?? []) {
      const deps = (task.depends_on as string[]) ?? []
      if (deps.length === 0) {
        log(`[Poll] Dispatching no-dependency pending task: ${task.task_id} (${task.label})`)
        await dispatchTask(task.task_id, task.goal_id)
      }
      // Tasks with deps are handled by unblockDependentTasks above
    }

    log(`[Poll] Cycle complete. Active watchdogs: ${activeWatchdogs.size}, Executing goals: ${executingGoals?.length ?? 0}`)
  } catch (err: any) {
    log(`[Poll] Supervisor cycle error: ${err.message}`)
  }
}

// ─── Adaptive polling loop ────────────────────────────────────────────────────

let pollTimer: NodeJS.Timeout | null = null

async function scheduleNextPoll() {
  // Determine whether there is active work to decide the next poll interval.
  // We re-check the DB state here (one lightweight query) rather than relying
  // on stale in-memory counters that could drift after crashes/restarts.
  const { data: executingGoals } = await supabase
    .from('goals')
    .select('id')
    .eq('status', 'executing')
    .limit(1)

  const hasActiveWork = (executingGoals?.length ?? 0) > 0 || activeWatchdogs.size > 0
  const interval = hasActiveWork ? POLL_INTERVAL_ACTIVE : POLL_INTERVAL_IDLE

  log(`Next poll in ${interval / 1000}s (${hasActiveWork ? 'active work detected' : 'idle — backing off'})`)
  pollTimer = setTimeout(async () => {
    await pollSupervisor()
    await scheduleNextPoll()
  }, interval)
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  log('Orc supervisor starting... [mode: polling-primary + adaptive-backoff, GCP Cloud SQL]')

  // 1. Initial State Recovery — re-sync on boot in case of crash/restart
  const { data: runningTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, goal_id, assigned_at')
    .eq('status', 'running')

  const TEN_MINUTES = 10 * 60_000
  const now = Date.now()

  log(`Checking ${runningTasks?.length || 0} active tasks for staleness...`)
  for (const task of runningTasks || []) {
    const age = now - new Date(task.assigned_at).getTime()
    if (age > TEN_MINUTES) {
      log(`Task ${task.task_id} stuck in running > 10m. Resetting to pending for re-queue...`)
      await supabase.from('goal_tasks').update({ status: 'pending' }).eq('task_id', task.task_id)
    } else {
      startWatchdog(task.task_id, task.goal_id)
    }
  }

  // 2. Start the adaptive polling loop — runs immediately, then backs off when idle
  log(`Starting adaptive polling supervisor (active: ${POLL_INTERVAL_ACTIVE / 1000}s, idle: ${POLL_INTERVAL_IDLE / 1000}s)...`)
  await pollSupervisor()
  await scheduleNextPoll()

  log('Supervisor ready. [mode: polling-only, Cloud SQL PostgreSQL]')
}

process.on('unhandledRejection', (reason, promise) => {
  log(`FATAL: Unhandled Rejection at: ${promise}, reason: ${reason}`)
  process.exit(1)
})

process.on('uncaughtException', (err) => {
  log(`FATAL: Uncaught Exception: ${err.message}`)
  process.exit(1)
})

main().catch(err => {
  log(`FATAL: ${err.message}`)
  process.exit(1)
})
