// POST /api/goals/[id]/dispatch
// Dispatches one approved task from the orchestrator plan to the correct worker.
// Called per-task as the founder approves each one in the PlanCard UI.
//
// Critical fixes implemented:
// 1. AUTH GATE — request must have a valid Supabase session
// 2. IDEMPOTENCY — uses goal_tasks UNIQUE(goal_id, task_id), returns 200 if already dispatched
// 3. DEPENDS_ON — checks all dependency tasks are 'completed' before dispatching
// 4. TOCTOU FIX — goal status set with conditional WHERE clause
// 5. ENV_MODE SNAPSHOT — locked at first dispatch, all workers in goal use the same mode

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { runWorkerTask, logEvent } from '@/lib/onyx-client'
import type { OrchestratorTask, WorkerDept, WorkerTask } from '@/types'
import { z } from 'zod'

type Params = { params: { id: string } }

const DispatchSchema = z.object({
  task_id: z.string().min(1, 'task_id is required'),
  task_override: z.object({
    label: z.string().optional(),
    reasoning: z.string().optional(),
    params: z.record(z.unknown()).optional(),
  }).optional(),
})

// Departments are now dynamic (Phase 1)

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    // Allow internal system bypass for automated "Chain Reaction" dispatches
    const internalSecret = req.headers.get('x-crost-internal-secret')
    const isInternal = internalSecret && internalSecret === process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!user && !isInternal) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await req.json()
    const { task_id, task_override } = DispatchSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Load the goal and its plan
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', params.id)
      .single()

    if (goalError || !goal) {
      return NextResponse.json(
        { success: false, error: 'Goal not found', code: 'NOT_FOUND', timestamp: new Date().toISOString() },
        { status: 404 }
      )
    }

    // Auth gate check for human-initiated dispatches (with overrides)
    if (task_override && !user) {
      return NextResponse.json({ error: 'Unauthorized: Manual overrides require a user session.' }, { status: 403 })
    }

    const plan = goal.orchestrator_plan as { tasks: OrchestratorTask[] } | null
    if (!plan || !Array.isArray(plan.tasks)) {
      return NextResponse.json(
        { success: false, error: 'Goal has no orchestrator plan yet', code: 'NO_PLAN', timestamp: new Date().toISOString() },
        { status: 422 }
      )
    }

    // ─── CHAIN REACTION HANDLER ─────────────────────────────────────────────
    if (task_id === 'CHAIN_REACTION') {
      console.log(`[Dispatch] Chain Reaction triggered for goal ${goal.id}`)
      const { data: allTasks } = await supabase.from('goal_tasks').select('*').eq('goal_id', goal.id)
      const planned = (allTasks || []).filter(t => t.status === 'planned')
      
      let count = 0
      for (const t of planned) {
        const blockers = (t.depends_on || []).filter(depId => {
          const depTask = (allTasks || []).find(at => at.task_id === depId)
          return !depTask || depTask.status !== 'completed'
        })
        
        if (blockers.length === 0) {
          // Recursive call to self for this specific task
          console.log(`[Dispatch] Releasing dependency for task ${t.task_id}`)
          fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/goals/${goal.id}/dispatch`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'x-crost-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
            },
            body: JSON.stringify({ task_id: t.task_id })
          }).catch(e => console.error(`[Dispatch] Recursive dispatch failed for ${t.task_id}:`, e))
          count++
        }
      }
      
      return NextResponse.json({ success: true, count, timestamp: new Date().toISOString() })
    }

    const task = plan.tasks.find((t) => t.id === task_id) as OrchestratorTask | undefined
    if (!task) {
      return NextResponse.json(
        { success: false, error: `Task "${task_id}" not found in plan`, code: 'TASK_NOT_FOUND', timestamp: new Date().toISOString() },
        { status: 404 }
      )
    }

    // ─── Idempotency check ────────────────────────────────────────────────────
    const { data: existingTask } = await supabase
      .from('goal_tasks')
      .select('status')
      .eq('goal_id', params.id)
      .eq('task_id', task_id)
      .single()

    if (existingTask) {
      if (['dispatched', 'completed', 'running'].includes(existingTask.status)) {
        return NextResponse.json({
          success: true,
          data: { dispatched: false, reason: 'already_dispatched', status: existingTask.status, dept: task.dept, task_id, goal_id: goal.id },
          timestamp: new Date().toISOString(),
        })
      }
    }

    // ─── Depends_on enforcement ───────────────────────────────────────────────
    if (task.depends_on && task.depends_on.length > 0) {
      const { data: depTasks } = await supabase
        .from('goal_tasks')
        .select('task_id, status')
        .eq('goal_id', params.id)
        .in('task_id', task.depends_on)

      const depList = depTasks ?? []
      const finishedIds = depList.filter(d => d.status === 'completed').map(d => d.task_id)
      const missingOrPending = task.depends_on.filter(id => !finishedIds.includes(id))

      if (missingOrPending.length > 0) {
        // Ensure the task is marked as 'planned' in the DB if it was somehow 'dispatched'
        await supabase
          .from('goal_tasks')
          .update({ status: 'planned' })
          .eq('goal_id', params.id)
          .eq('task_id', task_id)

        return NextResponse.json(
          {
            success: false,
            error: `Task depends on ${missingOrPending.length} unfinished or missing task(s): ${missingOrPending.join(', ')}`,
            code: 'DEPENDENCY_PENDING',
            timestamp: new Date().toISOString(),
          },
          { status: 409 }
        )
      }
    }

    // ─── Approval expiry check ────────────────────────────────────────────────
    // Check approval_queue for this goal/task to ensure no expired approvals execute.
    const { data: approvalRow } = await supabase
      .from('approval_queue')
      .select('status, expires_at')
      .eq('goal_id', params.id)
      .eq('action_type', 'task_approval')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (approvalRow && approvalRow.expires_at && new Date(approvalRow.expires_at) < new Date()) {
      await supabase
        .from('goal_tasks')
        .update({ status: 'expired', completed_at: new Date().toISOString() })
        .eq('goal_id', params.id)
        .eq('task_id', task_id)

      return NextResponse.json(
        { success: false, error: 'Approval window expired for this task', code: 'APPROVAL_EXPIRED', timestamp: new Date().toISOString() },
        { status: 410 }
      )
    }

    // ─── Env mode snapshot ────────────────────────────────────────────────────
    // Lock env_mode at first dispatch — prevents mid-goal mode toggle from breaking
    // the Orchestrator's model assignments. All workers read from this snapshot.
    let envModeSnapshot = goal.env_mode_snapshot as 'local' | 'cloud' | null

    if (!envModeSnapshot) {
      // First task being dispatched — capture live env_mode and lock it
      const { data: modeRow } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'env_mode')
        .single()

      envModeSnapshot = (modeRow?.value as string ?? 'cloud').replace(/"/g, '') as 'local' | 'cloud'

      await supabase
        .from('goals')
        .update({ env_mode_snapshot: envModeSnapshot })
        .eq('id', params.id)
    }

    // ─── TOCTOU-safe goal status update ───────────────────────────────────────
    // Only update to 'executing' if status is still 'awaiting_approval'.
    // Uses WHERE clause to prevent race conditions on concurrent dispatches.
    await supabase
      .from('goals')
      .update({ status: 'executing' })
      .eq('id', goal.id)
      .eq('status', 'awaiting_approval')  // Conditional: only applies once

    // ─── Mark task as running (V5 status) (+ apply overrides) ─────────────────
    const isModified = !!task_override
    
    // Use upsert to handle cases where the orchestrator failed to insert the task row initially
    const { error: upsertError } = await supabase
      .from('goal_tasks')
      .upsert({ 
        goal_id: params.id,
        task_id: task_id,
        created_by: goal.created_by,
        dept_slug: task.dept,
        action: task.action,
        label: task_override?.label || task.label,
        reasoning: task_override?.reasoning || task.reasoning,
        // expected_deliverable: (task as any).expected_deliverable || task.label, // Removed missing column
        params: task_override?.params || task.params,
        risk_level: task.risk_level,
        depends_on: task.depends_on,
        model: task.model,
        status: 'running',
        assigned_at: new Date().toISOString(),
        ...(isModified && { orc_notes: [{ ts: new Date().toISOString(), note: 'Founder modified task details before dispatch', action_taken: 'MODIFIED_BY_FOUNDER' }] })
      }, {
        onConflict: 'goal_id,task_id'
      })

    if (upsertError) {
      console.error('[dispatch] Failed to upsert task row:', upsertError)
      return NextResponse.json(
        { success: false, error: 'Database synchronization failed', details: upsertError.message },
        { status: 500 }
      )
    }

    // Merge overrides into the task for execution
    const finalTask = {
      ...task,
      ...(task_override?.label && { label: task_override.label }),
      ...(task_override?.reasoning && { reasoning: task_override.reasoning }),
      ...(task_override?.params && { params: task_override.params }),
    }

    // Log the approval and dispatch event
    await logEvent({
      event_type: 'approval_approved',
      department_slug: task.dept,
      goal_id: goal.id,
      description: isModified ? `Task modified & dispatched: ${finalTask.label}` : `Task approved and dispatched: ${task.label}`,
      metadata: { task_id, goal_id: goal.id, dept: task.dept, env_mode_snapshot: envModeSnapshot, modified: isModified },
    })

    // Shape the OrchestratorTask into a WorkerTask
    const workerTask: WorkerTask = {
      id: finalTask.id,
      action: finalTask.action,
      label: finalTask.label,
      reasoning: finalTask.reasoning,
      expected_deliverable: (finalTask as any).expected_deliverable || finalTask.label,
      params: finalTask.params,
      risk_level: finalTask.risk_level,
      model: finalTask.model,
    }

    // Dispatch to worker asynchronously — return immediately, UI polls dept status
    runWorkerTask(task.dept as WorkerDept, workerTask, goal.id, envModeSnapshot).catch(async (err) => {
      console.error(`[dispatch] Worker "${task.dept}" failed for task "${task_id}":`, err)
      // Mark task as failed in goal_tasks
      await supabase
        .from('goal_tasks')
        .update({ status: 'failed', completed_at: new Date().toISOString() })
        .eq('goal_id', params.id)
        .eq('task_id', task_id)

      await supabase.from('event_log').insert({
        department_slug: task.dept,
        goal_id: goal.id,
        event_type: 'task_failed',
        description: `Worker task failed: ${task.label}`,
        metadata: { task_id, error: String(err) },
      })
    })

    return NextResponse.json({
      success: true,
      data: { dispatched: true, dept: task.dept, task_id, goal_id: goal.id, env_mode_snapshot: envModeSnapshot },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() },
        { status: 400 }
      )
    }
    console.error('[POST /api/goals/[id]/dispatch]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to dispatch task', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
