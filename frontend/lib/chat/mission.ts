// lib/chat/mission.ts — turn a plan Orc proposed in chat into a running mission.
// Uses the existing engine untouched: a goal row + planned goal_tasks, then CHAIN_REACTION dispatch
// (departments run in dependency order; external actions still go to the approval queue).
// Server-side ONLY.

import { randomUUID } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase'
import { triggerDispatch } from '@/lib/background'
import { getModel } from '@/lib/engine/model'
import type { ChatPlan } from './orc'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'task'
}

export function planToOrchestratorTasks(plan: ChatPlan, execModel: string) {
  const ids = plan.tasks.map(() => randomUUID())
  return plan.tasks.map((t, i) => ({
    id: ids[i],
    dept: t.dept,
    action: slugify(t.label),
    label: t.label,
    reasoning: t.deliverable || t.label,
    params: {},
    risk_level: 'low' as const,
    model: execModel,
    depends_on: t.depends_on.map((n) => ids[n - 1]).filter(Boolean),
    expected_deliverable: t.deliverable || t.label,
  }))
}

/** Creates the goal + tasks and starts dispatch. Returns the goal id. */
export async function startMission(params: {
  userId: string
  plan: ChatPlan
  founderInput: string
}): Promise<string> {
  const supabase = createServerSupabaseClient()
  const { model: execModel } = await getModel('execution', params.userId)
  const tasks = planToOrchestratorTasks(params.plan, execModel)

  const { data: goal, error } = await supabase
    .from('goals')
    .insert({
      title: params.plan.title,
      founder_input: params.founderInput.slice(0, 4000),
      orchestrator_plan: {
        goal: params.plan.title,
        risk_note: 'Planned in chat with Orc and started by the founder.',
        data_gathered: {},
        tasks,
      },
      risk_note: 'Planned in chat with Orc and started by the founder.',
      status: 'executing',
      response_mode: 'quick_plan',
      created_by: params.userId,
    })
    .select('id')
    .single()
  if (error || !goal) throw new Error(`Could not create mission: ${error?.message ?? 'unknown'}`)

  const { error: taskErr } = await supabase.from('goal_tasks').insert(
    tasks.map((t) => ({
      goal_id: goal.id,
      task_id: t.id,
      created_by: params.userId,
      dept_slug: t.dept,
      action: t.action,
      label: t.label,
      reasoning: t.reasoning,
      expected_deliverable: t.expected_deliverable,
      params: t.params,
      risk_level: t.risk_level,
      depends_on: t.depends_on,
      model: t.model,
      status: 'planned',
    }))
  )
  if (taskErr) throw new Error(`Could not create mission tasks: ${taskErr.message}`)

  triggerDispatch(goal.id, 'CHAIN_REACTION')
  return goal.id as string
}
