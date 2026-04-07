#!/usr/bin/env tsx
// scripts/worker.ts
// Orc's persistent supervision loop.
// Run with: npx tsx scripts/worker.ts
// Or as a long-running Docker container in docker-compose.
//
// Responsibilities per the v6 review:
//   2. Real-time supervision of executing departments
//   3. Workload adjustment and rebalancing
//   4. Stall detection and founder escalation
//   5. Goal closure and post-mortem memo

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: 'frontend/.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPERVISION_POLL_MS = 15_000       // poll every 15 seconds for executing goals
const STALL_THRESHOLD_MS = 5 * 60_000   // 5 minutes = stalled

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[worker] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string, meta?: Record<string, unknown>) {
  console.log(`[orc-worker][${new Date().toISOString()}] ${msg}`, meta ?? '')
}

async function writeEvent(
  eventType: string,
  description: string,
  goalId?: string,
  meta?: Record<string, unknown>
) {
  await supabase.from('event_log').insert({
    event_type: eventType,
    description,
    goal_id: goalId ?? null,
    department_slug: 'orchestrator',
    metadata: meta ?? {},
  })
}

// ─── Post-mortem memo ──────────────────────────────────────────────────────────

async function writePostMortemMemo(
  goalId: string,
  founderInput: string,
  tasks: Array<{ task_id: string; dept_slug: string; label: string; status: string; orc_notes: unknown[] }>
) {
  const completed = tasks.filter(t => t.status === 'completed')
  const failed    = tasks.filter(t => t.status === 'failed')
  const rejected  = tasks.filter(t => t.status === 'rejected')

  const body = [
    `Goal: "${founderInput}"`,
    '',
    `Outcome: ${completed.length} tasks completed, ${failed.length} failed, ${rejected.length} rejected.`,
    '',
    completed.length > 0 ? `Completed:\n${completed.map((t: { dept_slug: string; label: string }) => `  - [${t.dept_slug}] ${t.label}`).join('\n')}` : '',
    failed.length > 0    ? `Failed:\n${failed.map((t: { dept_slug: string; label: string }) => `  - [${t.dept_slug}] ${t.label}`).join('\n')}` : '',
    rejected.length > 0  ? `Rejected by founder:\n${rejected.map((t: { dept_slug: string; label: string }) => `  - [${t.dept_slug}] ${t.label}`).join('\n')}` : '',
    '',
    `Post-mortem written by Orc at ${new Date().toISOString()}.`,
  ].filter((l: string) => l !== '').join('\n')

  await supabase.from('company_memos').insert({
    from_department: 'orchestrator',
    from_department_id: null,
    title: `[Post-Mortem] ${founderInput.slice(0, 80)}`,
    body,
    tags: ['post-mortem', 'orc', 'goal'],
    priority: failed.length > 0 ? 'high' : 'normal',
    read_by: ['orchestrator'],
    source_type: 'orchestrator',
    confidence: 1.0,
    based_on: ['goal_tasks', 'event_log'],
  })

  await writeEvent('goal_post_mortem_written', `Post-mortem written for goal "${founderInput.slice(0, 60)}"`, goalId)
}

// ─── Goal closure ─────────────────────────────────────────────────────────────

async function tryCloseGoal(goalId: string, founderInput: string) {
  const { data: tasks } = await supabase
    .from('goal_tasks')
    .select('task_id, dept_slug, label, status, orc_notes')
    .eq('goal_id', goalId)

  if (!tasks || tasks.length === 0) return

  const terminalStatuses = new Set(['completed', 'failed', 'rejected', 'expired'])
  const allTerminal = tasks.every(t => terminalStatuses.has(t.status))

  if (!allTerminal) return // some tasks still in flight

  const allSucceeded = tasks.every(t => t.status === 'completed')
  const finalStatus = allSucceeded ? 'completed' : 'completed' // always 'completed' — outcome captures failures

  const outcome = tasks.filter(t => t.status !== 'completed').length === 0
    ? 'All tasks completed successfully.'
    : `${tasks.filter(t => t.status === 'failed').length} task(s) failed, ${tasks.filter(t => t.status === 'rejected').length} rejected, ${tasks.filter(t => t.status === 'completed').length} completed.`

  await supabase
    .from('goals')
    .update({ status: finalStatus, outcome })
    .eq('id', goalId)
    .eq('status', 'executing') // Guard: only close if still executing

  await writePostMortemMemo(goalId, founderInput, tasks)
  await writeEvent('goal_closed', `Goal closed: ${outcome}`, goalId, { final_status: finalStatus })

  // Trigger Orc synthesis report (Phase 4)
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  try {
    log(`Triggering synthesis report for goal: ${goalId}`)
    await fetch(`${APP_URL}/api/goals/${goalId}/report`, { method: 'POST' })
  } catch (reportErr) {
    log(`Warning: Failed to trigger synthesis report for goal ${goalId}: ${reportErr}`)
  }

  log(`Goal closed: ${goalId}`, { outcome })
}

// ─── Stall detection ──────────────────────────────────────────────────────────

async function checkForStalls(goalId: string) {
  // A task is stalled if it's been 'dispatched' (running) for > STALL_THRESHOLD_MS
  const staleThreshold = new Date(Date.now() - STALL_THRESHOLD_MS).toISOString()

  const { data: stalledTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, dept_slug, label, assigned_at')
    .eq('goal_id', goalId)
    .eq('status', 'dispatched')
    .lt('assigned_at', staleThreshold)

  for (const stalled of stalledTasks ?? []) {
    log(`Stall detected: task "${stalled.task_id}" in dept "${stalled.dept_slug}"`, { goalId })

    // Append an Orc note to the task
    const { data: taskRow } = await supabase
      .from('goal_tasks')
      .select('orc_notes')
      .eq('task_id', stalled.task_id)
      .eq('goal_id', goalId)
      .single()

    const notes = (taskRow?.orc_notes as Array<unknown>) ?? []
    notes.push({
      ts: new Date().toISOString(),
      note: `Department "${stalled.dept_slug}" stalled on task "${stalled.label}" — no completion after ${STALL_THRESHOLD_MS / 60_000} minutes.`,
      action_taken: 'escalation_raised',
    })

    await supabase
      .from('goal_tasks')
      .update({ orc_notes: notes })
      .eq('task_id', stalled.task_id)
      .eq('goal_id', goalId)

    // Log escalation to event_log (which surfaces in the dashboard)
    await writeEvent(
      'orc_stall_detected',
      `Stall detected: [${stalled.dept_slug}] "${stalled.label}" — no completion in ${STALL_THRESHOLD_MS / 60_000} minutes. Founder review recommended.`,
      goalId,
      { task_id: stalled.task_id, dept_slug: stalled.dept_slug }
    )

    // Raise an escalation approval so the founder sees it in the approval feed
    await supabase.from('approval_queue').insert({
      department_id: null,
      department_name: 'Orchestrator',
      department_slug: 'orchestrator',
      action_type: 'other',
      action_label: `[Orc Escalation] Stalled: ${stalled.label}`,
      reasoning: `The ${stalled.dept_slug} department has not completed task "${stalled.label}" in ${STALL_THRESHOLD_MS / 60_000} minutes. This may indicate an error or a blocked state. Orc recommends reviewing the event log and potentially re-dispatching.`,
      payload: { task_id: stalled.task_id, dept_slug: stalled.dept_slug, goal_id: goalId },
      context: `Orc stall detection — goal ${goalId}`,
      risk_level: 'medium',
      goal_id: goalId,
      status: 'pending',
    })
  }
}

// ─── Dependency unblocking ────────────────────────────────────────────────────

async function unblockDependentTasks(goalId: string) {
  // Find tasks that are 'pending_dependency' and check if their blockers are now done
  const { data: blockedTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, dept_slug, label, depends_on')
    .eq('goal_id', goalId)
    .eq('status', 'pending_dependency')

  for (const blocked of blockedTasks ?? []) {
    if (!blocked.depends_on || (blocked.depends_on as string[]).length === 0) continue

    const { data: depTasks } = await supabase
      .from('goal_tasks')
      .select('task_id, status')
      .eq('goal_id', goalId)
      .in('task_id', blocked.depends_on as string[])

    const allComplete = (depTasks ?? []).every((d: { status: string }) => d.status === 'completed')
    if (allComplete) {
      // Set back to 'approved' so the next dispatch attempt will proceed
      await supabase
        .from('goal_tasks')
        .update({ status: 'approved' })
        .eq('task_id', blocked.task_id)
        .eq('goal_id', goalId)

      log(`Dependencies resolved — task "${blocked.task_id}" unblocked`, { goalId, dept: blocked.dept_slug })
      await writeEvent(
        'orc_rebalance',
        `Dependencies resolved: task "${blocked.label}" [${blocked.dept_slug}] is now ready to dispatch`,
        goalId,
        { task_id: blocked.task_id }
      )
    }
  }
}

// ─── Main supervision tick ────────────────────────────────────────────────────

async function supervisionTick() {
  const { data: executingGoals } = await supabase
    .from('goals')
    .select('id, founder_input, last_status_check, supervision_interval_seconds')
    .eq('status', 'executing')

  if (!executingGoals || executingGoals.length === 0) return

  for (const goal of executingGoals) {
    try {
      // Respect per-goal supervision interval
      const intervalMs = (goal.supervision_interval_seconds ?? 30) * 1000
      const lastCheck = goal.last_status_check ? new Date(goal.last_status_check).getTime() : 0
      if (Date.now() - lastCheck < intervalMs) continue

      log(`Supervision tick for goal: ${goal.id}`)

      // Update last_status_check timestamp
      await supabase
        .from('goals')
        .update({ last_status_check: new Date().toISOString() })
        .eq('id', goal.id)

      // 1. Check for stalled tasks and escalate
      await checkForStalls(goal.id)

      // 2. Unblock any pending_dependency tasks whose deps are now complete
      await unblockDependentTasks(goal.id)

      // 3. Try to close the goal if all tasks are in a terminal state
      await tryCloseGoal(goal.id, goal.founder_input)
    } catch (err) {
      log(`Error during supervision tick for goal ${goal.id}: ${err}`)
    }
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  log('Orc supervision worker started.')

  while (true) {
    try {
      await supervisionTick()
    } catch (err) {
      log(`Supervision tick error: ${err}`)
    }
    await new Promise(resolve => setTimeout(resolve, SUPERVISION_POLL_MS))
  }
}

main()
