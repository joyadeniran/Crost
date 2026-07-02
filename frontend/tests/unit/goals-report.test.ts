/**
 * Unit tests: app/api/goals/[id]/report/route.ts (T7 — dual-mode auth).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

process.env.WORKER_INTERNAL_SECRET = 'test-internal-secret'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockGoal: any = { id: 'goal-1' }
const runOrcReportMock = vi.fn(() => Promise.resolve())

vi.mock('@/lib/llm-client', () => ({
  runOrcReport: (...args: any[]) => runOrcReportMock(...args),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: mockGoal, error: null })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/goals/[id]/report/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockGoal = { id: 'goal-1' }
  runOrcReportMock.mockClear()
})

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/goals/goal-1/report', { method: 'POST', headers })
}

describe('POST /api/goals/[id]/report', () => {
  it('returns 401 when unauthenticated and no internal secret', async () => {
    mockUser = null
    const res = await POST(makeReq(), { params: { id: 'goal-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the goal does not belong to the session user', async () => {
    mockGoal = null
    const res = await POST(makeReq(), { params: { id: 'goal-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 200 and calls runOrcReport for the owning session user', async () => {
    const res = await POST(makeReq(), { params: { id: 'goal-1' } })
    expect(res.status).toBe(200)
    expect(runOrcReportMock).toHaveBeenCalledWith('goal-1')
  })

  it('trusted internal secret bypasses the ownership lookup entirely', async () => {
    mockUser = null // no session at all
    mockGoal = null // would 404 on the session path
    const res = await POST(makeReq({ 'x-crost-internal-secret': 'test-internal-secret' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(200)
    expect(runOrcReportMock).toHaveBeenCalledWith('goal-1')
  })

  it('an invalid internal secret falls through to session auth (401 when unauthenticated)', async () => {
    mockUser = null
    const res = await POST(makeReq({ 'x-crost-internal-secret': 'wrong-secret' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 500 when runOrcReport throws', async () => {
    runOrcReportMock.mockRejectedValueOnce(new Error('boom'))
    const res = await POST(makeReq(), { params: { id: 'goal-1' } })
    expect(res.status).toBe(500)
  })
})
