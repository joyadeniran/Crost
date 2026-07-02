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
      eq: vi.fn(() => builder),
      contains: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => Promise.resolve({ data: mockMemos, error: mockListError })),
      insert: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: insertedMemo, error: null })),
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
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
