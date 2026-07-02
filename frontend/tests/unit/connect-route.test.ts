/**
 * Unit tests: app/api/connect/route.ts (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockIdempotencyResponse: any = { kind: 'none' }
const upsertMock = vi.fn(() => Promise.resolve({ error: null }))

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
      upsert: upsertMock,
      update: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      or: vi.fn(() => Promise.resolve({ error: null })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/connect/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockIdempotencyResponse = { kind: 'none' }
  upsertMock.mockClear()
})

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/connect', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makeReq({ provider: 'gmail' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when provider is missing', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('marks a Google service as connected via Firebase OAuth, no external call', async () => {
    const res = await POST(makeReq({ provider: 'gmail' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connected).toBe(true)
    expect(body.method).toBe('google-oauth')
    expect(upsertMock).toHaveBeenCalled()
  })

  it('treats any "google*"-prefixed provider as a Google service', async () => {
    const res = await POST(makeReq({ provider: 'googledrive' }))
    const body = await res.json()
    expect(body.connected).toBe(true)
  })

  it('returns manual-setup instructions for a non-Google provider', async () => {
    const res = await POST(makeReq({ provider: 'slack' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.connected).toBe(false)
    expect(body.mcp_endpoint).toContain('/api/mcp')
  })

  it('short-circuits with the idempotent cached response on replay', async () => {
    mockIdempotencyResponse = {
      kind: 'response',
      response: new Response(JSON.stringify({ replayed: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    }
    const res = await POST(makeReq({ provider: 'gmail' }, { 'idempotency-key': 'dup' }))
    const body = await res.json()
    expect(body.replayed).toBe(true)
  })
})
