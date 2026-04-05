// POST /api/goals/[id]/dispatch
// Dispatches one approved task from the orchestrator plan to the correct worker.
// Called per-task as the founder approves each one in the PlanCard UI.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { runWorkerTask } from '@/lib/onyx-client'
import type { OrchestratorTask, WorkerDept, WorkerTask } from '@/types'
import { z } from 'zod'

type Params = { params: { id: string } }

const DispatchSchema = z.object({
  task_id: z.string().min(1, 'task_id is required'),
})

const VALID_DEPTS: WorkerDept[] = ['sales', 'marketing', 'ops']

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json()
    const { task_id } = DispatchSchema.parse(body)
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

    if (!VALID_DEPTS.includes(task.dept as WorkerDept)) {
      return NextResponse.json(
        { success: false, error: `Invalid dept: ${task.dept}`, code: 'INVALID_DEPT', timestamp: new Date().toISOString() },
        { status: 400 }
      )
    }

    // Log the approval event
    await supabase.from('event_log').insert({
      department_slug: task.dept,
      goal_id: goal.id,
      event_type: 'approval_approved',
      description: `Task approved: ${task.label}`,
      metadata: { task_id, goal_id: goal.id, dept: task.dept },
    })

    // Update goal status to executing (if not already)
    if (goal.status === 'awaiting_approval') {
      await supabase.from('goals').update({ status: 'executing' }).eq('id', goal.id)
    }

    // Shape the OrchestratorTask into a WorkerTask
    const workerTask: WorkerTask = {
      id: task.id,
      action: task.action,
      label: task.label,
      reasoning: task.reasoning,
      params: task.params,
      risk_level: task.risk_level,
      model: task.model,
    }

    // Dispatch to worker asynchronously — return immediately, UI polls dept status
    runWorkerTask(task.dept as WorkerDept, workerTask, goal.id).catch(async (err) => {
      console.error(`[dispatch] Worker "${task.dept}" failed for task "${task_id}":`, err)
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
      data: { dispatched: true, dept: task.dept, task_id, goal_id: goal.id },
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
