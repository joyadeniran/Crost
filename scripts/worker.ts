#!/usr/bin/env tsx
// scripts/worker.ts
// Orc's ZERO-POLL supervision worker.
// Uses Supabase Realtime (Websockets) to eliminate periodic DB heartbeats.
//
// Responsibilities:
//   1. Event-driven supervision via Realtime subscriptions.
//   2. In-memory stall detection (Watchdog Timers).
//   3. Goal closure and post-mortem generation.
//   4. Multi-tenant context preservation.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

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

// ─── Post-mortem memo ──────────────────────────────────────────────────────────

async function writePostMortemMemo(
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
    `Post-mortem written by Orc at ${new Date().toISOString()}.`,
  ].filter((l: string) => l !== '').join('\n')

  const { data: goal } = await supabase.from('goals').select('created_by').eq('id', goalId).single()

  await supabase.from('company_memos').insert({
    goal_id: goalId,
    from_department: 'orchestrator',
    title: `[Post-Mortem] ${founderInput.slice(0, 80)}`,
    body,
    tags: ['post-mortem', 'orc', 'goal'],
    priority: failed.length > 0 ? 'high' : 'normal',
    source_type: 'orchestrator',
    confidence: 1.0,
    created_by: goal?.created_by
  })

  await writeEvent('goal_post_mortem_written', `Post-mortem written for goal "${founderInput.slice(0, 60)}"`, goalId)
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

// ─── Goal Management (Zero Poll) ──────────────────────────────────────────────

async function unblockDependentTasks(goalId: string) {
  const { data: blockedTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, dept_slug, label, depends_on')
    .eq('goal_id', goalId)
    .eq('status', 'pending_dependency')

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
      await supabase.from('goal_tasks').update({ status: 'approved' }).eq('task_id', blocked.task_id).eq('goal_id', goalId)
      log(`Dependencies resolved & Memos verified — task "${blocked.task_id}" unblocked`, { goalId })
      await writeEvent('orc_rebalance', `Task "${blocked.label}" is now ready (Data Verified)`, goalId)
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

  const terminalStatuses = new Set(['completed', 'failed', 'rejected', 'expired'])
  const allTerminal = tasks.every(t => terminalStatuses.has(t.status))
  if (!allTerminal) return

  const allSucceeded = tasks.every(t => t.status === 'completed')
  const outcome = allSucceeded 
    ? 'All tasks completed successfully.' 
    : `${tasks.filter(t => t.status === 'failed').length} failed, ${tasks.filter(t => t.status === 'completed').length} completed.`

  await writePostMortemMemo(goalId, goal.founder_input, tasks)

  // Trigger Synthesis Report Reliably before goal closure
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
  if (!APP_URL) {
    log(`Warning: NEXT_PUBLIC_APP_URL not set. Skipping report generation.`);
  } else {
    try {
      log(`Triggering Orc Synthesis Report for goal: ${goalId}...`)
      await fetch(`${APP_URL}/api/goals/${goalId}/report`, { method: 'POST' })
    } catch (err) {
      log(`Failed to generate Synthesis Report: ${err}`)
    }
  }

  await supabase.from('goals').update({ status: 'completed', outcome }).eq('id', goalId)

  log(`Goal closed: ${goalId}`)
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

async function main() {
  log('Orc ZERO-POLL supervisor starting...')

  // 1. Initial State Recovery (Hit DB once to re-sync map in case of crash)
  const { data: runningTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, goal_id, assigned_at')
    .eq('status', 'dispatched')

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

  // 2. Realtime Subscriptions
  const channel = supabase.channel('worker_supervision')

  channel
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goal_tasks' }, async (payload) => {
      const { task_id, goal_id, status } = payload.new
      log(`Event received: goal_tasks UPDATE [${task_id}] -> ${status}`)

      if (status === 'dispatched') {
        startWatchdog(task_id, goal_id)
      } else if (['completed', 'failed', 'rejected', 'expired'].includes(status)) {
        clearWatchdog(task_id)
        // Reactive logic: check for deps and closure
        await unblockDependentTasks(goal_id)
        await tryCloseGoal(goal_id)
      }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'goal_tasks' }, async (payload) => {
      const { task_id, goal_id, status } = payload.new
      if (status === 'dispatched') {
        startWatchdog(task_id, goal_id)
      }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'goals' }, async (payload) => {
       if (payload.new.status === 'executing' && payload.old.status !== 'executing') {
         log(`Goal ${payload.new.id} switched to executing. Running supervision...`)
         await tryCloseGoal(payload.new.id)
       }
    })
    .subscribe((status) => {
      log(`Realtime subscription status: ${status}`)
    })

  log('Supervisor is now event-driven. [Idling... 0 egress consumption]')
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
