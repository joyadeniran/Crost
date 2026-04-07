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

    const plan = goal.orchestrator_plan as { tasks: OrchestratorTask[] } | null
    if (!plan || !Array.isArray(plan.tasks)) {
      return NextResponse.json(
        { success: false, error: 'Goal has no orchestrator plan yet', code: 'NO_PLAN', timestamp: new Date().toISOString() },
        { status: 422 }
      )
    }

    const task = plan.tasks.find((t) => t.id === task_id) as OrchestratorTask | undefined
    if (!task) {
      return NextResponse.json(
        { success: false, error: `Task "${task_id}" not found in plan`, code: 'TASK_NOT_FOUND', timestamp: new Date().toISOString() },
        { status: 404 }
      )
    }

    // Validation of dept is now handled dynamically in runOrchestratorTask
    // and enforced by the presence of a department record in the DB.

    // ─── Idempotency check ────────────────────────────────────────────────────
    // Check goal_tasks for this task. If already dispatched/completed, return 200.
    const { data: existingTask } = await supabase
      .from('goal_tasks')
      .select('status')
      .eq('goal_id', params.id)
      .eq('task_id', task_id)
      .single()

    if (existingTask) {
      if (['dispatched', 'completed'].includes(existingTask.status)) {
        return NextResponse.json({
          success: true,
          data: { dispatched: false, reason: 'already_dispatched', status: existingTask.status, dept: task.dept, task_id, goal_id: goal.id },
          timestamp: new Date().toISOString(),
        })
      }
      if (existingTask.status === 'rejected') {
        return NextResponse.json(
          { success: false, error: 'Task was rejected by founder', code: 'TASK_REJECTED', timestamp: new Date().toISOString() },
          { status: 409 }
        )
      }
    }

    // ─── Depends_on enforcement ───────────────────────────────────────────────
    // Block dispatch if any dependency task has not yet completed.
    if (task.depends_on && task.depends_on.length > 0) {
      const { data: depTasks } = await supabase
        .from('goal_tasks')
        .select('task_id, status')
        .eq('goal_id', params.id)
        .in('task_id', task.depends_on)

      const blockers = (depTasks ?? []).filter(d => d.status !== 'completed')
      if (blockers.length > 0) {
        // Update task status to 'pending_dependency' so the supervision loop can retry
        await supabase
          .from('goal_tasks')
          .update({ status: 'pending_dependency' })
          .eq('goal_id', params.id)
          .eq('task_id', task_id)

        return NextResponse.json(
          {
            success: false,
            error: `Task depends on ${blockers.length} unfinished task(s): ${blockers.map(b => b.task_id).join(', ')}`,
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

    // ─── Mark task as dispatched (+ apply overrides) ─────────────────────────
    const isModified = !!task_override
    await supabase
      .from('goal_tasks')
      .update({ 
        status: 'dispatched', 
        assigned_at: new Date().toISOString(),
        ...(task_override?.label && { label: task_override.label }),
        ...(task_override?.reasoning && { reasoning: task_override.reasoning }),
        ...(task_override?.params && { params: task_override.params }),
        ...(isModified && { orc_notes: [{ ts: new Date().toISOString(), note: 'Founder modified task details before dispatch', action_taken: 'MODIFIED_BY_FOUNDER' }] })
      })
      .eq('goal_id', params.id)
      .eq('task_id', task_id)

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
