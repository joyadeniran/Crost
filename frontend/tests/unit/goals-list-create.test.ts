/**
 * Unit tests: app/api/goals/route.ts — GET (list) / POST (create) (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockGoals: any[] = []
let mockListError: any = null
let mockIdempotencyResponse: any = { kind: 'none' }
const insertedGoal = { id: 'goal-1', title: 't', founder_input: 'do a thing', status: 'pending', created_by: 'user-1' }

vi.mock('@/lib/idempotency', () => ({
  beginIdempotentRequest: vi.fn(() => Promise.resolve(mockIdempotencyResponse)),
  completeIdempotentRequest: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/llm-client', () => ({
  runOrchestratorTask: vi.fn(() => Promise.resolve()),
  logEvent: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve({ data: mockGoals, error: mockListError })),
      insert: vi.fn(() => builder),
      update: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: insertedGoal, error: null })),
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { GET, POST } from '@/app/api/goals/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockGoals = []
  mockListError = null
  mockIdempotencyResponse = { kind: 'none' }
})

describe('GET /api/goals', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(new NextRequest('http://localhost/api/goals'))
    expect(res.status).toBe(401)
  })

  it('returns the session user\'s goals only (query is scoped by created_by via the mock)', async () => {
    mockGoals = [{ id: 'g1', created_by: 'user-1' }]
    const res = await GET(new NextRequest('http://localhost/api/goals'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockGoals)
  })

  it('clamps the limit param to [1, 100]', async () => {
    const res = await GET(new NextRequest('http://localhost/api/goals?limit=99999'))
    expect(res.status).toBe(200)
  })

  it('returns 500 on a query error', async () => {
    mockListError = { message: 'db down' }
    const res = await GET(new NextRequest('http://localhost/api/goals'))
    expect(res.status).toBe(500)
  })
})

function makePostReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/goals', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makePostReq({ founder_input: 'a valid goal here' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for a founder_input that is too short (zod)', async () => {
    const res = await POST(makePostReq({ founder_input: 'hi' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('creates the goal and returns 201 for a valid request', async () => {
    const res = await POST(makePostReq({ founder_input: 'Launch a marketing campaign' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data).toEqual(insertedGoal)
  })

  it('short-circuits with the idempotent cached response on replay', async () => {
    mockIdempotencyResponse = {
      kind: 'response',
      response: new Response(JSON.stringify({ replayed: true }), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    }
    const res = await POST(makePostReq({ founder_input: 'Launch a marketing campaign' }, { 'idempotency-key': 'dup' }))
    const body = await res.json()
    expect(body.replayed).toBe(true)
  })
})
