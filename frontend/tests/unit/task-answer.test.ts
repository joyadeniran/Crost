/**
 * "Needs your input" no longer dead-ends a mission:
 *  - POST /api/goals/[id]/tasks/[taskId]/answer stores the founder's answer (task row AND saved plan,
 *    which the dispatcher reads), re-queues the step and resumes dispatch.
 *  - PATCH skip on the last open step closes the mission instead of leaving it 'executing'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const guard = vi.fn()
vi.mock('@/lib/auth/guard', () => ({ requireUser: (...a: unknown[]) => guard(...a) }))
const triggerDispatch = vi.fn()
const runInBackground = vi.fn()
vi.mock('@/lib/background', () => ({ triggerDispatch: (...a: unknown[]) => triggerDispatch(...a), runInBackground: (...a: unknown[]) => runInBackground(...a) }))
vi.mock('@/lib/engine/orchestrator', () => ({ runOrcReport: vi.fn(async () => {}) }))

let goal: any
let task: any
let allTasks: any[]
const updates: Array<{ table: string; payload: any }> = []

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      let payload: any = null
      const b: any = {
        select: () => b, eq: () => b, in: () => b,
        update: (p: any) => { payload = p; updates.push({ table, payload: p }); return b },
        insert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: table === 'goals' ? goal : task, error: null }),
        single: async () => ({ data: goal, error: null }),
        then: (resolve: any) => Promise.resolve(payload ? { error: null } : { data: allTasks, error: null }).then(resolve),
      }
      return b
    },
  }),
  createSupabaseServerComponentClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } }),
}))

const { POST: answer } = await import('@/app/api/goals/[id]/tasks/[taskId]/answer/route')
const { PATCH } = await import('@/app/api/goals/[id]/tasks/[taskId]/route')

const req = (body: unknown, method = 'POST') =>
  new NextRequest('http://x/api/goals/g1/tasks/t1/answer', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const ctx = { params: { id: 'g1', taskId: 't1' } }

beforeEach(() => {
  vi.clearAllMocks()
  updates.length = 0
  guard.mockResolvedValue({ ok: true, userId: 'user-1', via: 'session' })
  goal = { id: 'g1', orchestrator_plan: { tasks: [{ id: 't1', params: { a: 1 } }, { id: 't2', params: {} }] } }
  task = { task_id: 't1', status: 'needs_data', params: { a: 1 }, orc_notes: [{ note: 'What was Q1 revenue?' }] }
  allTasks = []
})

describe('POST .../tasks/[taskId]/answer', () => {
  it('rejects unauthenticated requests', async () => {
    guard.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await answer(req({ answer: 'x' }), ctx)).status).toBe(401)
  })

  it('404s for a mission the user does not own', async () => {
    goal = null
    expect((await answer(req({ answer: 'x' }), ctx)).status).toBe(404)
    expect(triggerDispatch).not.toHaveBeenCalled()
  })

  it('409s when the step is not waiting for input', async () => {
    task.status = 'running'
    expect((await answer(req({ answer: 'x' }), ctx)).status).toBe(409)
  })

  it('writes the answer to the task row and the saved plan, re-queues the step and resumes', async () => {
    const res = await answer(req({ answer: '$40k' }), ctx)
    expect(res.status).toBe(200)
    const planUpdate = updates.find((u) => u.table === 'goals')!.payload
    expect(planUpdate.orchestrator_plan.tasks[0].params).toEqual({ a: 1, founder_input: '$40k' })
    expect(planUpdate.orchestrator_plan.tasks[1].params).toEqual({})
    const taskUpdate = updates.find((u) => u.table === 'goal_tasks')!.payload
    expect(taskUpdate).toMatchObject({ status: 'planned', params: { a: 1, founder_input: '$40k' } })
    expect(taskUpdate.orc_notes.at(-1)).toMatchObject({ action_taken: 'FOUNDER_ANSWERED', note: '$40k' })
    expect(triggerDispatch).toHaveBeenCalledWith('g1', 'CHAIN_REACTION')
  })

  it('"use your best assumptions" resumes with an explicit instruction', async () => {
    await answer(req({ assume: true }), ctx)
    const taskUpdate = updates.find((u) => u.table === 'goal_tasks')!.payload
    expect(taskUpdate.params.founder_input).toMatch(/assumptions/i)
  })

  it('rejects an empty answer', async () => {
    expect((await answer(req({ answer: '  ' }), ctx)).status).toBe(400)
  })
})

describe('PATCH skip on the last open step', () => {
  it('closes the mission instead of leaving it executing', async () => {
    allTasks = [{ status: 'completed' }, { status: 'skipped' }]
    const res = await PATCH(req({ status: 'skipped' }, 'PATCH'), ctx)
    expect(res.status).toBe(200)
    expect(updates.find((u) => u.table === 'goals')?.payload).toEqual({ status: 'completed' })
    expect(runInBackground).toHaveBeenCalled()
    expect(triggerDispatch).not.toHaveBeenCalled()
  })

  it('keeps dispatching when other steps are still open', async () => {
    allTasks = [{ status: 'skipped' }, { status: 'planned' }]
    await PATCH(req({ status: 'skipped' }, 'PATCH'), ctx)
    expect(triggerDispatch).toHaveBeenCalledWith('g1', 'CHAIN_REACTION')
  })
})
