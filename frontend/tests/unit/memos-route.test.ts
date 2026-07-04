/**
 * Unit tests: app/api/memos/route.ts — GET (list) / POST (create) (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockMemos: any[] = []
let mockListError: any = null
let mockIdempotencyResponse: any = { kind: 'none' }
const insertedMemo = { id: 'memo-1', title: 'T', body: 'B' }
let eqCalls: [string, any][] = []

vi.mock('@/lib/idempotency', () => ({
  beginIdempotentRequest: vi.fn(() => Promise.resolve(mockIdempotencyResponse)),
  completeIdempotentRequest: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: any) => { eqCalls.push([col, val]); return builder }),
      contains: vi.fn(() => builder),
      order: vi.fn(() => builder),
      // Mirrors the real shim (lib/db.ts): .limit() stays chainable (returns
      // the builder), the actual query only resolves when awaited via .then().
      // A prior version of this mock resolved eagerly inside .limit(), which
      // broke as soon as a filter (goal_id/source_type) was applied *after*
      // .limit(50) — the same order the real route uses.
      limit: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: insertedMemo, error: null })),
      then: (resolve: any) => Promise.resolve({ data: mockMemos, error: mockListError }).then(resolve),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { GET, POST } from '@/app/api/memos/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockMemos = []
  mockListError = null
  mockIdempotencyResponse = { kind: 'none' }
  eqCalls = []
})

describe('GET /api/memos', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(new NextRequest('http://localhost/api/memos'))
    expect(res.status).toBe(401)
  })

  it('returns memos scoped to the session user', async () => {
    mockMemos = [{ id: 'm1' }]
    const res = await GET(new NextRequest('http://localhost/api/memos'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockMemos)
  })

  it('returns 500 on a query error', async () => {
    mockListError = { message: 'db down' }
    const res = await GET(new NextRequest('http://localhost/api/memos'))
    expect(res.status).toBe(500)
  })

  it('filters by goal_id when provided (needed by WarRoom to fetch a goal\'s memo)', async () => {
    const res = await GET(new NextRequest('http://localhost/api/memos?goal_id=goal-1'))
    expect(res.status).toBe(200)
    expect(eqCalls).toContainEqual(['goal_id', 'goal-1'])
    // Ownership scoping must still apply even when goal_id is present.
    expect(eqCalls).toContainEqual(['created_by', 'user-1'])
  })

  it('filters by source_type when provided', async () => {
    const res = await GET(new NextRequest('http://localhost/api/memos?source_type=orchestrator'))
    expect(res.status).toBe(200)
    expect(eqCalls).toContainEqual(['source_type', 'orchestrator'])
  })

  it('does not apply goal_id/source_type filters when the params are absent', async () => {
    await GET(new NextRequest('http://localhost/api/memos'))
    expect(eqCalls.some(([col]) => col === 'goal_id')).toBe(false)
    expect(eqCalls.some(([col]) => col === 'source_type')).toBe(false)
  })
})

function makePostReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/memos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/memos', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makePostReq({ from_department: 'sales', title: 't', body: 'b' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid body (zod — missing title)', async () => {
    const res = await POST(makePostReq({ from_department: 'sales', body: 'b' }))
    expect(res.status).toBe(400)
  })

  it('defaults priority to "normal" and tags to [] when omitted', async () => {
    const res = await POST(makePostReq({ from_department: 'sales', title: 't', body: 'b' }))
    expect(res.status).toBe(201)
  })

  it('short-circuits with the idempotent cached response on replay', async () => {
    mockIdempotencyResponse = {
      kind: 'response',
      response: new Response(JSON.stringify({ replayed: true }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    }
    const res = await POST(makePostReq({ from_department: 'sales', title: 't', body: 'b' }, { 'idempotency-key': 'dup' }))
    const body = await res.json()
    expect(body.replayed).toBe(true)
  })
})
