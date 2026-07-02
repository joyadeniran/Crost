/**
 * Unit tests: app/api/goals/[id]/dispatch/route.ts (T7 — dual-mode auth gates only).
 * The dispatch/waterfall/worker-execution internals are out of scope here
 * (T8/Phase 3 territory); this covers auth, ownership, idempotency short-
 * circuit, and the task_override-requires-session rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

process.env.WORKER_INTERNAL_SECRET = 'test-internal-secret'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockGoal: any = { id: 'goal-1', created_by: 'user-1', orchestrator_plan: null }
let mockIdempotencyResponse: any = { kind: 'none' }

vi.mock('@/lib/idempotency', () => ({
  beginIdempotentRequest: vi.fn(() => Promise.resolve(mockIdempotencyResponse)),
  completeIdempotentRequest: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/llm-client', () => ({
  runWorkerTask: vi.fn(() => Promise.resolve({})),
  logEvent: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/model-routing', () => ({
  getModelForTask: vi.fn(() => Promise.resolve({ model: 'groq/llama-3.3-70b-versatile', provider: 'groq' })),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: mockGoal, error: mockGoal ? null : { message: 'not found' } })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/goals/[id]/dispatch/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockGoal = { id: 'goal-1', created_by: 'user-1', orchestrator_plan: null }
  mockIdempotencyResponse = { kind: 'none' }
})

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/goals/goal-1/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/goals/[id]/dispatch — auth/ownership/idempotency gates', () => {
  it('returns 401 when unauthenticated and no internal secret', async () => {
    mockUser = null
    const res = await POST(makeReq({ task_id: 't1' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid body (zod — missing task_id)', async () => {
    const res = await POST(makeReq({}), { params: { id: 'goal-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the goal is not found or not owned by the session user', async () => {
    mockGoal = null
    const res = await POST(makeReq({ task_id: 't1' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(404)
  })

  it('short-circuits with the idempotent cached response when a replay is detected', async () => {
    mockIdempotencyResponse = { kind: 'response', response: NextResponse_json_helper() }
    const res = await POST(makeReq({ task_id: 't1' }, { 'idempotency-key': 'dup-key' }), { params: { id: 'goal-1' } })
    const body = await res.json()
    expect(body.replayed).toBe(true)
  })

  it('rejects a task_override without a user session, even with a valid internal secret', async () => {
    mockUser = null
    const res = await POST(
      makeReq({ task_id: 't1', task_override: { label: 'x' } }, { 'x-crost-internal-secret': 'test-internal-secret' }),
      { params: { id: 'goal-1' } },
    )
    expect(res.status).toBe(403)
  })

  it('trusted internal secret bypasses the 401 gate (proceeds to plan validation, 422 with no plan)', async () => {
    mockUser = null
    mockGoal = { id: 'goal-1', created_by: 'someone-else', orchestrator_plan: null }
    const res = await POST(makeReq({ task_id: 't1' }, { 'x-crost-internal-secret': 'test-internal-secret' }), { params: { id: 'goal-1' } })
    expect(res.status).not.toBe(401)
    expect(res.status).toBe(422)
  })

  it('an invalid internal secret does not bypass auth (401 when unauthenticated)', async () => {
    mockUser = null
    const res = await POST(makeReq({ task_id: 't1' }, { 'x-crost-internal-secret': 'wrong' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 422 when the goal has no orchestrator plan yet', async () => {
    mockGoal = { id: 'goal-1', created_by: 'user-1', orchestrator_plan: null }
    const res = await POST(makeReq({ task_id: 't1' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(422)
  })
})

// Minimal helper so we don't need to import NextResponse just for the idempotency mock
function NextResponse_json_helper() {
  return new Response(JSON.stringify({ replayed: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }) as any
}
