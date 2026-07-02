/**
 * Unit tests: app/api/goals/[id]/tasks/[taskId]/route.ts (T7 auth matrix).
 *
 * SPEC-DRIFT(§T7): docs/TEST_SPEC_10X.md lists this route as [dual] (session
 * OR x-crost-internal-secret), but the current implementation only checks
 * session auth via createSupabaseServerComponentClient() — there is no
 * internal-secret branch at all. Characterizing the code as written.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockGoal: any = { id: 'goal-1', created_by: 'user-1' }
let mockUpdateError: any = null
const insertMock = vi.fn(() => Promise.resolve({ error: null }))

global.fetch = vi.fn(() => Promise.resolve({ ok: true })) as any

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'event_log') return { insert: insertMock }
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data: mockGoal, error: null })),
        update: vi.fn(() => builder),
        then: (resolve: any) => Promise.resolve({ error: mockUpdateError }).then(resolve),
      }
      return builder
    }),
  })),
}))

import { PATCH } from '@/app/api/goals/[id]/tasks/[taskId]/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockGoal = { id: 'goal-1', created_by: 'user-1' }
  mockUpdateError = null
  insertMock.mockClear()
})

function makeReq(body: any) {
  return new NextRequest('http://localhost/api/goals/goal-1/tasks/task-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/goals/[id]/tasks/[taskId]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await PATCH(makeReq({ status: 'completed' }), { params: { id: 'goal-1', taskId: 'task-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid status value (zod)', async () => {
    const res = await PATCH(makeReq({ status: 'bogus' }), { params: { id: 'goal-1', taskId: 'task-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the goal is not found or not owned by the session user (cross-user)', async () => {
    mockGoal = null
    const res = await PATCH(makeReq({ status: 'rejected' }), { params: { id: 'goal-1', taskId: 'task-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 200 for the owning user and logs an event', async () => {
    const res = await PATCH(makeReq({ status: 'completed' }), { params: { id: 'goal-1', taskId: 'task-1' } })
    expect(res.status).toBe(200)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'task_force_completed' }))
  })

  it('logs task_skipped for rejected/skipped status', async () => {
    await PATCH(makeReq({ status: 'rejected' }), { params: { id: 'goal-1', taskId: 'task-1' } })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'task_skipped' }))
  })

  it('returns 500 when the task update query errors', async () => {
    mockUpdateError = { message: 'db error' }
    const res = await PATCH(makeReq({ status: 'completed' }), { params: { id: 'goal-1', taskId: 'task-1' } })
    expect(res.status).toBe(500)
  })
})
