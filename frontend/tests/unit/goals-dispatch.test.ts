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
// Atomic-claim controls (Phase 3) — unused by the auth/ownership/idempotency
// gate tests below (they all short-circuit before reaching the claim), only
// exercised by the "atomic claim" describe block further down.
let mockClaimRow: any = { goal_id: 'goal-1', task_id: 't1', status: 'running' }
let mockExistingTaskRow: any = null // idempotency pre-check row, before the atomic claim
let mockCurrentStatusAfterBlockedClaim = 'running'

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

// Table-and-operation-aware builder: routes .single()/.maybeSingle()/.then()
// resolution based on which table + which write method (.update()/.upsert())
// was chained, since the real route touches goals, goal_tasks (three
// different ways), and system_config in one request.
vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const b: any = { _op: null as string | null }
      b.select = vi.fn(() => b)
      b.eq = vi.fn(() => b)
      b.in = vi.fn(() => b)
      b.update = vi.fn(() => { b._op = 'update'; return b })
      b.upsert = vi.fn(() => { b._op = 'upsert'; return b })
      b.single = vi.fn(async () => {
        if (table === 'goals') return { data: mockGoal, error: mockGoal ? null : { message: 'not found' } }
        if (table === 'goal_tasks') return { data: mockExistingTaskRow, error: mockExistingTaskRow ? null : { message: 'not found' } }
        if (table === 'system_config') return { data: { value: '"cloud"' }, error: null }
        return { data: null, error: null }
      })
      b.maybeSingle = vi.fn(async () => {
        if (table === 'goal_tasks' && b._op === 'upsert') return { data: mockClaimRow, error: null }
        if (table === 'goal_tasks') return { data: { status: mockCurrentStatusAfterBlockedClaim }, error: null }
        return { data: null, error: null }
      })
      b.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return b
    }),
  })),
}))

import { POST } from '@/app/api/goals/[id]/dispatch/route'
import { runWorkerTask } from '@/lib/llm-client'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockGoal = { id: 'goal-1', created_by: 'user-1', orchestrator_plan: null }
  mockIdempotencyResponse = { kind: 'none' }
  mockClaimRow = { goal_id: 'goal-1', task_id: 't1', status: 'running' }
  mockExistingTaskRow = null
  mockCurrentStatusAfterBlockedClaim = 'running'
  vi.mocked(runWorkerTask).mockClear()
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

// ─── Atomic claim (Phase 3) ─────────────────────────────────────────────────
// Exercises the full dispatch happy path with a table-aware builder, mocking
// the guarded upsert directly (`.upsert(...).maybeSingle()`) rather than
// re-implementing lib/db.ts's SQL — the guard's SQL generation itself is
// covered in tests/unit/db.test.ts. This proves the ROUTE reacts correctly
// to a claimed vs. blocked upsert: claimed → dispatches; blocked → returns
// "already_claimed" and does NOT call runWorkerTask a second time.
describe('POST /api/goals/[id]/dispatch — atomic claim', () => {
  const planTask = {
    id: 't1',
    dept: 'marketing',
    action: 'draft_post',
    label: 'Draft post',
    reasoning: 'r',
    params: {},
    risk_level: 'low',
    depends_on: [],
    model: 'groq/llama-3.3-70b-versatile',
  }

  beforeEach(() => {
    mockGoal = {
      id: 'goal-1',
      created_by: 'user-1',
      env_mode_snapshot: 'cloud', // pre-set so the system_config lookup is skipped
      orchestrator_plan: { tasks: [planTask] },
    }
  })

  it('dispatches and calls runWorkerTask when the atomic claim succeeds', async () => {
    const res = await POST(makeReq({ task_id: 't1' }), { params: { id: 'goal-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.dispatched).toBe(true)
    expect(runWorkerTask).toHaveBeenCalledTimes(1)
  })

  it('returns already_claimed and skips runWorkerTask when the guard blocks the upsert', async () => {
    mockClaimRow = null // simulates RETURNING 0 rows — another request already claimed it
    mockCurrentStatusAfterBlockedClaim = 'running'

    const res = await POST(makeReq({ task_id: 't1' }), { params: { id: 'goal-1' } })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.dispatched).toBe(false)
    expect(body.data.reason).toBe('already_claimed')
    expect(body.data.status).toBe('running')
    expect(runWorkerTask).not.toHaveBeenCalled()
  })
})
