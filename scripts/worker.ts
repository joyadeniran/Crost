#!/usr/bin/env tsx
// scripts/worker.ts
// Orc's supervision worker.
//
// Architecture: Polling-primary + Realtime bonus
//   - A 15-second poll loop is the PRIMARY supervision engine (reliable on all Supabase tiers)
//   - Supabase Realtime subscriptions (postgres_changes) are an OPPORTUNISTIC bonus:
//     when available they provide instant event delivery; when unavailable the poll covers everything.
//   - All operations are idempotent — safe to run from both poll and Realtime simultaneously.
//
// Responsibilities:
//   1. Polling supervisor — watchdog sync, dependency unblocking, goal closure, pending dispatch.
//   2. In-memory stall detection (Watchdog Timers).
//   3. Goal closure and Mission Report generation.
//   4. Multi-tenant context preservation.

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

const localEnvPath = path.resolve(process.cwd(), 'frontend/.env.local')
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath })
} else {
  dotenv.config() // Fallback to process.env and standard .env for production
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const STALL_THRESHOLD_MS = 5 * 60_000   // 5 minutes = stalled
const POLL_INTERVAL_MS   = 15_000       // 15 seconds between supervisor cycles

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

// Log Supabase connection details (URL masked for security)
const urlHost = new URL(SUPABASE_URL).hostname
console.log(`[worker] Connecting to Supabase: https://${urlHost}/`)
console.log(`[worker] Using Service Role Key: ${SUPABASE_SERVICE_KEY.slice(0, 20)}...`)

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: {
    params: {
      events_per_second: 10,
    },
  },
})

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
    .eq('status', 'planned')

  for (const blocked of blockedTasks ?? []) {
    const dependencies = blocked.depends_on as string[] || []
    if (dependencies.length === 0) continue

    // 1. Check if all dependent tasks are 'completed'
    const { data: depTasks } = await supabase
      .from('goal_tasks')
      .select('task_id, status')
      .eq('goal_id', goalId)
      .in('task_id', dependencies)

    const allTasksComplete = (depTasks ?? []).every((d: any) => d.status === 'completed')
    if (!allTasksComplete) continue

    // 2. Strict Waterfall: Check if all dependencies have actually posted a memo
    // This ensures data exists before unblocking
    const { data: memos } = await supabase
      .from('company_memos')
      .select('task_id')
      .eq('goal_id', goalId)
      .in('task_id', dependencies)

    const postedMemos = new Set((memos ?? []).map(m => m.task_id))
    const allMemosExist = dependencies.every(depId => postedMemos.has(depId))

    if (allMemosExist) {
      await dispatchTask(blocked.task_id, goalId)
      log(`Dependencies resolved & memos verified — auto-dispatching task "${blocked.task_id}"`, { goalId })
      await writeEvent('orc_rebalance', `Task "${blocked.label}" auto-dispatched after dependency verification`, goalId)
    } else {
      const missing = dependencies.filter(id => !postedMemos.has(id))
      log(`Task "${blocked.task_id}" still waiting for memos from: ${missing.join(', ')}`, { goalId })
    }
  }
}

async function tryCloseGoal(goalId: string) {
  const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
  if (!goal || goal.status !== 'executing') return

  const { data: tasks } = await supabase.from('goal_tasks').select('*').eq('goal_id', goalId)
  if (!tasks || tasks.length === 0) return

  const terminalStatuses = new Set(['completed', 'rejected', 'expired'])
  const allTerminal = tasks.every(t => terminalStatuses.has(t.status))
  if (!allTerminal) return

  const allSucceeded = tasks.every(t => t.status === 'completed')
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

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  log('Orc supervisor starting... [mode: polling-primary + realtime-bonus]')

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

  // 2. Realtime Subscriptions (opportunistic bonus — instant delivery when available)
  //    On Supabase free tier, postgres_changes requires tables to be in the supabase_realtime
  //    publication. If not enabled, the subscription times out and the poll covers everything.
  const channel = supabase.channel('worker_supervision')
  let realtimeConnected = false

  channel
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goal_tasks' }, async (payload) => {
      const { task_id, goal_id, status } = payload.new
      log(`[Realtime] goal_tasks UPDATE [${task_id}] -> ${status}`)

      if (status === 'running') {
        startWatchdog(task_id, goal_id)
      } else if (['completed', 'failed', 'rejected', 'expired'].includes(status)) {
        clearWatchdog(task_id)
        await unblockDependentTasks(goal_id)
        await tryCloseGoal(goal_id)
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goal_tasks' }, async (payload) => {
      const { task_id, goal_id, status } = payload.new
      log(`[Realtime] goal_tasks INSERT [${task_id}] status=${status}`)
      if (status === 'running') {
        startWatchdog(task_id, goal_id)
      } else if (status === 'pending') {
        // Instant dispatch for no-dependency tasks — don't wait for next poll
        const deps = (payload.new.depends_on as string[]) ?? []
        if (deps.length === 0) {
          log(`[Realtime] Instantly dispatching no-dep task: ${task_id}`)
          await dispatchTask(task_id, goal_id)
        }
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goals' }, async (payload) => {
      if (payload.new.status === 'executing' && payload.old.status !== 'executing') {
        log(`[Realtime] Goal ${payload.new.id} switched to executing — running supervision...`)
        await unblockDependentTasks(payload.new.id)
        await tryCloseGoal(payload.new.id)
      }
    })
    .subscribe((status) => {
      log(`Realtime subscription status: ${status}`)
      if (status === 'SUBSCRIBED') {
        realtimeConnected = true
        log('✓ Realtime bonus active — instant event delivery enabled alongside polling')
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        realtimeConnected = false
        log(`⚠ Realtime unavailable (${status}) — polling loop is sole supervisor (this is fine)`)
      }
    })

  // 3. Start the polling loop — always runs, regardless of Realtime status
  log(`Starting polling supervisor (every ${POLL_INTERVAL_MS / 1000}s)...`)
  await pollSupervisor() // Run immediately on boot
  setInterval(pollSupervisor, POLL_INTERVAL_MS)

  log(`Supervisor ready. [Poll: every ${POLL_INTERVAL_MS / 1000}s] [Realtime: ${realtimeConnected ? 'bonus-active' : 'connecting...'}]`)
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
