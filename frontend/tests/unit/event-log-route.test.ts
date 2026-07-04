/**
 * Unit tests: app/api/event-log/route.ts — GET (list, ownership-scoped).
 *
 * Added to replace WarRoom.tsx's dead client-side `supabaseClient.from('event_log')`
 * call (lib/supabase-browser.ts's `.from()` is a stub that always resolves empty
 * with no error — see WarRoom's inline failed-goal error-detail fetch, which
 * silently never surfaced anything). This route gives the browser a real,
 * ownership-scoped way to fetch a goal's recent error events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockEvents: any[] = []
let mockListError: any = null
let eqCalls: [string, any][] = []
let inCalls: [string, any[]][] = []
let limitCalls: number[] = []

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: any) => { eqCalls.push([col, val]); return builder }),
      in: vi.fn((col: string, vals: any[]) => { inCalls.push([col, vals]); return builder }),
      order: vi.fn(() => builder),
      limit: vi.fn((n: number) => { limitCalls.push(n); return Promise.resolve({ data: mockEvents, error: mockListError }) }),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { GET } from '@/app/api/event-log/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockEvents = []
  mockListError = null
  eqCalls = []
  inCalls = []
  limitCalls = []
})

describe('GET /api/event-log', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(new NextRequest('http://localhost/api/event-log'))
    expect(res.status).toBe(401)
  })

  it('scopes to the session user by created_by', async () => {
    const res = await GET(new NextRequest('http://localhost/api/event-log'))
    expect(res.status).toBe(200)
    expect(eqCalls).toContainEqual(['created_by', 'user-1'])
  })

  it('filters by goal_id when provided', async () => {
    await GET(new NextRequest('http://localhost/api/event-log?goal_id=goal-1'))
    expect(eqCalls).toContainEqual(['goal_id', 'goal-1'])
  })

  it('does not filter by goal_id when absent', async () => {
    await GET(new NextRequest('http://localhost/api/event-log'))
    expect(eqCalls.some(([col]) => col === 'goal_id')).toBe(false)
  })

  it('filters by a comma-separated event_type list when provided', async () => {
    await GET(new NextRequest('http://localhost/api/event-log?event_type=error,task_failed,orc_stall_detected'))
    expect(inCalls).toContainEqual(['event_type', ['error', 'task_failed', 'orc_stall_detected']])
  })

  it('defaults limit to 20 and honors a smaller explicit limit', async () => {
    await GET(new NextRequest('http://localhost/api/event-log'))
    expect(limitCalls).toContain(20)
    limitCalls = []
    await GET(new NextRequest('http://localhost/api/event-log?limit=3'))
    expect(limitCalls).toContain(3)
  })

  it('caps limit at 50 even if a larger value is requested', async () => {
    await GET(new NextRequest('http://localhost/api/event-log?limit=500'))
    expect(limitCalls).toContain(50)
  })

  it('returns the events on success', async () => {
    mockEvents = [{ id: 'e1', description: 'boom', event_type: 'error', created_at: '2026-01-01' }]
    const res = await GET(new NextRequest('http://localhost/api/event-log'))
    const body = await res.json()
    expect(body.data).toEqual(mockEvents)
  })

  it('returns 500 on a query error', async () => {
    mockListError = { message: 'db down' }
    const res = await GET(new NextRequest('http://localhost/api/event-log'))
    expect(res.status).toBe(500)
  })
})
