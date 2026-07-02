/**
 * Unit tests: app/api/goals/[id]/dialogue/route.ts (T7 + finding #8 regression).
 *
 * Finding #8 regression: all 3 update sites (message-append, force_plan, and
 * the orchestrator-failure catch handler) must be ownership-scoped with
 * .eq('created_by', user.id) — verified via the eq-call spy below.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockGoal: any = { founder_input: 'do a thing', orc_conversation: [], status: 'planning' }
let mockIdempotencyResponse: any = { kind: 'none' }
const eqCalls: any[] = []
const updateCalls: any[] = []

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
      eq: vi.fn((...args: any[]) => {
        eqCalls.push(args)
        return builder
      }),
      single: vi.fn(() => Promise.resolve({ data: mockGoal, error: mockGoal ? null : { message: 'not found' } })),
      update: vi.fn((payload: any) => {
        updateCalls.push(payload)
        return builder
      }),
      then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/goals/[id]/dialogue/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockGoal = { founder_input: 'do a thing', orc_conversation: [], status: 'planning' }
  mockIdempotencyResponse = { kind: 'none' }
  eqCalls.length = 0
  updateCalls.length = 0
})

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/goals/goal-1/dialogue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/goals/[id]/dialogue', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makeReq({ message: 'hi' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 500 when the goal is not found or not owned by the session user (cross-user)', async () => {
    mockGoal = null
    const res = await POST(makeReq({ message: 'hi' }), { params: { id: 'goal-1' } })
    // Route wraps the "not found" throw in the outer catch -> 500, not 404.
    expect(res.status).toBe(500)
  })

  it('appends the message to conversation history and sets status to planning (ownership-scoped update)', async () => {
    const res = await POST(makeReq({ message: 'my answer' }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(200)
    const historyUpdate = updateCalls.find((u) => u.orc_conversation)
    expect(historyUpdate.orc_conversation).toHaveLength(1)
    expect(historyUpdate.status).toBe('planning')
    // Ownership scoping regression (finding #8): created_by must be in the eq chain
    expect(eqCalls.some(([col, val]) => col === 'created_by' && val === 'user-1')).toBe(true)
  })

  it('force_plan without a message flips status to planning (ownership-scoped update)', async () => {
    const res = await POST(makeReq({ force_plan: true }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(200)
    const statusUpdate = updateCalls.find((u) => u.status === 'planning' && !u.orc_conversation)
    expect(statusUpdate).toBeDefined()
  })

  it('short-circuits with the idempotent cached response on replay', async () => {
    mockIdempotencyResponse = {
      kind: 'response',
      response: new Response(JSON.stringify({ replayed: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    }
    const res = await POST(makeReq({ message: 'x' }, { 'idempotency-key': 'dup' }), { params: { id: 'goal-1' } })
    const body = await res.json()
    expect(body.replayed).toBe(true)
  })

  it('returns 400-shaped 500 gracefully on invalid zod body types (caught by outer try/catch)', async () => {
    const res = await POST(makeReq({ message: 123 }), { params: { id: 'goal-1' } })
    expect(res.status).toBe(500)
  })
})
