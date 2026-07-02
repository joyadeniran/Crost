/**
 * Unit tests: app/api/calendar-events/route.ts — GET/POST (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockEvents: any[] = []
let mockListError: any = null
let mockRateLimitAllowed = true

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => (mockRateLimitAllowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 10 })),
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
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { id: 'ev1' }, error: null })),
      then: (resolve: any) => Promise.resolve({ data: mockEvents, error: mockListError }).then(resolve),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { GET, POST } from '@/app/api/calendar-events/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockEvents = []
  mockListError = null
  mockRateLimitAllowed = true
})

describe('GET /api/calendar-events', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(new NextRequest('http://localhost/api/calendar-events'))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitAllowed = false
    const res = await GET(new NextRequest('http://localhost/api/calendar-events'))
    expect(res.status).toBe(429)
  })

  it('returns events scoped to the session user', async () => {
    mockEvents = [{ id: 'e1', user_id: 'user-1' }]
    const res = await GET(new NextRequest('http://localhost/api/calendar-events'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockEvents)
  })

  it('applies the upcoming/days window filter', async () => {
    const res = await GET(new NextRequest('http://localhost/api/calendar-events?upcoming=true&days=7'))
    expect(res.status).toBe(200)
  })

  it('returns 500 on a query error', async () => {
    mockListError = { message: 'db down' }
    const res = await GET(new NextRequest('http://localhost/api/calendar-events'))
    expect(res.status).toBe(500)
  })
})

function makePostReq(body: any) {
  return new NextRequest('http://localhost/api/calendar-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/calendar-events', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makePostReq({ title: 'Meeting', date: new Date().toISOString() }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitAllowed = false
    const res = await POST(makePostReq({ title: 'Meeting', date: new Date().toISOString() }))
    expect(res.status).toBe(429)
  })

  it('returns 400 for an invalid date (zod)', async () => {
    const res = await POST(makePostReq({ title: 'Meeting', date: 'not-a-date' }))
    expect(res.status).toBe(400)
  })

  it('creates a valid event and returns 201', async () => {
    const res = await POST(makePostReq({ title: 'Investor Call', date: new Date().toISOString(), type: 'investor_meeting' }))
    expect(res.status).toBe(201)
  })
})
