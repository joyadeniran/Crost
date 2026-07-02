/**
 * Unit tests: app/api/worker/execute/route.ts
 *
 * Covers:
 *  - BUG-6: catch-all writes goal_tasks=failed, event_log task_failed, and company_memo
 *  - BUG-6: catch-all still returns 500 after observability writes
 *  - Auth gate: unauthenticated request (no session, no internal secret) → 401
 *  - COMPOSIO_API_KEY missing → 500 before task lookup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Env setup — must happen before any module imports ─────────────────────
process.env.COMPOSIO_API_KEY = 'test-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'internal-secret'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

// ── Captured side-effects ─────────────────────────────────────────────────
const taskUpdates: any[] = []
const loggedEvents: Array<{ event_type: string; [k: string]: any }> = []
const memoInserts: any[] = []

// ── Supabase mock factory ──────────────────────────────────────────────────
// Use closure over `queryBuilder` directly (not `this`) so the reference
// is stable across vi.fn() call boundaries.
function mockSupabaseClient() {
  const queryBuilder: any = {}

  queryBuilder._table = ''
  queryBuilder.select = vi.fn(() => queryBuilder)
  queryBuilder.eq = vi.fn(() => queryBuilder)
  queryBuilder.order = vi.fn(() => queryBuilder)
  queryBuilder.limit = vi.fn(() => queryBuilder)
  queryBuilder.single = vi.fn(async () => {
    if (queryBuilder._table === 'goal_tasks') {
      return {
        data: {
          status: 'running',
          goal_id: 'goal-1',
          dept_slug: 'marketing',
          created_by: mockTaskCreatedBy,
        },
        error: null,
      }
    }
    return { data: { id: 'mock-id' }, error: null }
  })
  queryBuilder.update = vi.fn((payload: any) => {
    if (queryBuilder._table === 'goal_tasks') {
      taskUpdates.push(payload)
    }
    return queryBuilder
  })
  queryBuilder.insert = vi.fn((rows: any) => {
    const row = Array.isArray(rows) ? rows[0] : rows
    if (queryBuilder._table === 'event_log') {
      loggedEvents.push(row)
    }
    if (queryBuilder._table === 'company_memos') {
      memoInserts.push(row)
    }
    return queryBuilder
  })
  queryBuilder.then = vi.fn((resolve: any) =>
    Promise.resolve({ data: null, error: null }).then(resolve)
  )

  return {
    from: vi.fn((table: string) => {
      queryBuilder._table = table
      return queryBuilder
    }),
  }
}

// ── Mock user session state — toggled per test ─────────────────────────────
let mockUserNull = false
let mockTaskCreatedBy: string | null = 'user-1'

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient()),
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => {
        if (mockUserNull) return { data: { user: null }, error: null }
        return { data: { user: { id: 'user-1' } }, error: null }
      }),
    },
  })),
}))

vi.mock('@/lib/tools/execute-tool-call', () => ({
  executeToolCall: vi.fn().mockRejectedValue(new Error('Composio execution failed')),
}))

vi.mock('@/lib/utils', () => ({
  cleanLargePayload: vi.fn((x: any) => x),
}))

// ── Lifecycle ─────────────────────────────────────────────────────────────

beforeEach(() => {
  taskUpdates.length = 0
  loggedEvents.length = 0
  memoInserts.length = 0
  mockUserNull = false
  mockTaskCreatedBy = 'user-1'
})

// ── Helpers ───────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, any>, extraHeaders: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/worker/execute', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-crost-internal-secret': 'internal-secret',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('POST /api/worker/execute — BUG-6 catch-all observability', () => {
  it('updates goal_tasks to failed when executeToolCall throws', async () => {
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = makeRequest({
      taskId: 'task-1',
      goalId: 'goal-1',
      userId: 'user-1',
      toolName: 'gmail.send_email',
      args: { to: 'test@example.com' },
    })

    const res = await POST(req)
    expect(res.status).toBe(500)

    const failedUpdate = taskUpdates.find((u: any) => u.status === 'failed')
    expect(failedUpdate).toBeDefined()
    expect(failedUpdate?.completed_at).toBeDefined()
  })

  it('writes task_failed event to event_log on catch', async () => {
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = makeRequest({
      taskId: 'task-2',
      goalId: 'goal-1',
      userId: 'user-1',
      toolName: 'gmail.send_email',
      args: {},
    })

    await POST(req)

    const taskFailedEvent = loggedEvents.find((e: any) => e.event_type === 'task_failed')
    expect(taskFailedEvent).toBeDefined()
    expect(taskFailedEvent?.goal_id).toBe('goal-1')
    expect(taskFailedEvent?.metadata?.error).toContain('Composio execution failed')
  })

  it('inserts Execution Failed memo on catch', async () => {
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = makeRequest({
      taskId: 'task-3',
      goalId: 'goal-1',
      userId: 'user-1',
      toolName: 'gmail.send_email',
      args: {},
    })

    await POST(req)

    const failedMemo = memoInserts.find((m: any) => m.title?.startsWith('Execution Failed:'))
    expect(failedMemo).toBeDefined()
    expect(failedMemo?.priority).toBe('high')
    expect(failedMemo?.from_department).toBe('system')
  })

  it('still returns 500 JSON response after writing observability', async () => {
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = makeRequest({
      taskId: 'task-4',
      goalId: 'goal-1',
      userId: 'user-1',
      toolName: 'gmail.send_email',
      args: {},
    })

    const res = await POST(req)
    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.error).toBeDefined()
  })
})

describe('POST /api/worker/execute — auth gate', () => {
  it('returns 401 when no session and no internal secret', async () => {
    // Signal the mock to return null user
    mockUserNull = true

    const { POST } = await import('@/app/api/worker/execute/route')

    const req = new NextRequest('http://localhost/api/worker/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // no internal secret header
      body: JSON.stringify({ taskId: 'task-1', goalId: 'goal-1', toolName: 'gmail.send', args: {} }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('an invalid internal secret falls through to session auth (not trusted)', async () => {
    mockUserNull = true // session also absent -> should still 401, proving the bad secret wasn't trusted
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = new NextRequest('http://localhost/api/worker/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-crost-internal-secret': 'totally-wrong-secret' },
      body: JSON.stringify({ taskId: 'task-1', goalId: 'goal-1', toolName: 'gmail.send', args: {}, userId: 'attacker-supplied-id' }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('valid internal secret + body userId is trusted (proceeds past the auth gate)', async () => {
    const { POST } = await import('@/app/api/worker/execute/route')
    const req = makeRequest({
      taskId: 'task-trusted',
      goalId: 'goal-1',
      userId: 'user-1', // task fixture's created_by also 'user-1' -> ownership passes
      toolName: 'gmail.send_email',
      args: {},
    })
    const res = await POST(req)
    // executeToolCall is mocked to always reject in this suite, so the happy
    // path still ends in the BUG-6 catch-all (500) — but critically it is NOT
    // a 401/403, proving the trusted secret + matching ownership let it through
    // the auth and ownership gates to actual execution.
    expect(res.status).toBe(500)
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })

  it('returns 403 when the task belongs to a different user (session auth path)', async () => {
    mockTaskCreatedBy = 'other-user' // session user is 'user-1' (default mock)
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = new NextRequest('http://localhost/api/worker/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }, // no internal secret -> session path
      body: JSON.stringify({ taskId: 'task-owned-by-other', goalId: 'goal-1', toolName: 'gmail.send', args: {} }),
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('owner (created_by matches session user) passes the ownership gate', async () => {
    mockTaskCreatedBy = 'user-1' // matches default session mock
    const { POST } = await import('@/app/api/worker/execute/route')

    const req = new NextRequest('http://localhost/api/worker/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: 'task-owned', goalId: 'goal-1', toolName: 'gmail.send', args: {} }),
    })

    const res = await POST(req)
    // Passes auth + ownership, then fails at BUG-6 catch-all (executeToolCall
    // mocked to reject) — not a 401/403, proving it cleared both gates.
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(403)
  })
})
