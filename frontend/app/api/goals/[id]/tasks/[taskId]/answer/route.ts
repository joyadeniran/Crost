// POST /api/goals/[id]/tasks/[taskId]/answer — the founder answers a department's question.
// Body: { answer: string } (or { assume: true } to proceed on best assumptions).
// The answer is written into the task's params (row + saved plan, which the dispatcher reads), the
// task goes back to 'planned', and dispatch resumes the mission. Only tasks in 'needs_data' qualify.
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase'
import { triggerDispatch } from '@/lib/background'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string; taskId: string } }
const Body = z.union([
  z.object({ answer: z.string().trim().min(1).max(4000) }),
  z.object({ assume: z.literal(true) }),
])
const ASSUME_TEXT = 'No more information is available. Proceed now with sensible, clearly marked assumptions and [placeholders] the founder can fill in later.'

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  const userId = guard.userId

  let answer: string
  try {
    const body = Body.parse(await req.json())
    answer = 'answer' in body ? body.answer : ASSUME_TEXT
  } catch {
    return NextResponse.json({ success: false, error: 'An answer is required.', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const { data: goal } = await supabase
    .from('goals')
    .select('id, orchestrator_plan')
    .eq('id', params.id)
    .eq('created_by', userId)
    .maybeSingle()
  if (!goal) return NextResponse.json({ success: false, error: 'Mission not found', code: 'NOT_FOUND' }, { status: 404 })

  const { data: task } = await supabase
    .from('goal_tasks')
    .select('task_id, status, params, orc_notes')
    .eq('goal_id', params.id)
    .eq('task_id', params.taskId)
    .maybeSingle()
  if (!task) return NextResponse.json({ success: false, error: 'Step not found', code: 'NOT_FOUND' }, { status: 404 })
  if (task.status !== 'needs_data') {
    return NextResponse.json({ success: false, error: 'This step is not waiting for input.', code: 'CONFLICT' }, { status: 409 })
  }

  const newParams = { ...((task.params as Record<string, unknown>) ?? {}), founder_input: answer }
  const plan = goal.orchestrator_plan as { tasks?: Array<{ id: string; params?: Record<string, unknown> }> } | null
  if (plan?.tasks) {
    plan.tasks = plan.tasks.map((t) => (t.id === params.taskId ? { ...t, params: { ...(t.params ?? {}), founder_input: answer } } : t))
    await supabase.from('goals').update({ orchestrator_plan: plan, status: 'executing' }).eq('id', params.id).eq('created_by', userId)
  }

  const notes = Array.isArray(task.orc_notes) ? task.orc_notes : []
  await supabase
    .from('goal_tasks')
    .update({
      status: 'planned',
      params: newParams,
      completed_at: null,
      orc_notes: [...notes, { ts: new Date().toISOString(), note: answer, action_taken: 'FOUNDER_ANSWERED' }],
    })
    .eq('goal_id', params.id)
    .eq('task_id', params.taskId)

  triggerDispatch(params.id, 'CHAIN_REACTION')
  return NextResponse.json({ success: true, data: { resumed: true } })
}
