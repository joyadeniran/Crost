/**
 * Unit tests: app/api/suggested-actions/[id]/execute/route.ts (T7 auth/status
 * gates + needs_input/make_changes branches). Deep gmail/kb tool-call
 * branches are exercised via mocked executeToolCall status codes only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockAction: any = null
let mockIdempotencyResponse: any = { kind: 'none' }
const executeToolCallMock = vi.fn()
const updateCalls: any[] = []

vi.mock('@/lib/tools/execute-tool-call', () => ({
  executeToolCall: (...args: any[]) => executeToolCallMock(...args),
}))

vi.mock('@/lib/idempotency', () => ({
  beginIdempotentRequest: vi.fn(() => Promise.resolve(mockIdempotencyResponse)),
  completeIdempotentRequest: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data: mockAction, error: mockAction ? null : { message: 'not found' } })),
        update: vi.fn((payload: any) => {
          updateCalls.push(payload)
          return builder
        }),
        insert: vi.fn(() => Promise.resolve({ error: null })),
      }
      return builder
    }),
  })),
}))

import { POST } from '@/app/api/suggested-actions/[id]/execute/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockAction = null
  mockIdempotencyResponse = { kind: 'none' }
  executeToolCallMock.mockReset()
  updateCalls.length = 0
})

function makeReq(body: any = {}) {
  return new NextRequest('http://localhost/api/suggested-actions/a1/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/suggested-actions/[id]/execute', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the action is not found or not owned by the session user', async () => {
    mockAction = null
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(404)
  })

  it('returns 409 for an action already in a terminal state', async () => {
    mockAction = { id: 'a1', status: 'completed', action_slug: 'add_to_memo', payload: {} }
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(409)
  })

  it('returns needs_input:true when required_inputs are missing from the request', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: {}, required_inputs: ['destination_email'] }
    const res = await POST(makeReq({ inputs: {} }), { params: { id: 'a1' } })
    const body = await res.json()
    expect(body.needs_input).toBe(true)
    expect(body.fields).toEqual(['destination_email'])
  })

  it('make_changes returns a redirect payload without calling executeToolCall', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'make_changes', payload: { goal_id: 'g1', artifact_id: 'art1' }, required_inputs: [] }
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.redirect).toBe(true)
    expect(executeToolCallMock).not.toHaveBeenCalled()
  })

  it('returns 400 and marks failed for an unimplemented action_slug', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'totally_unknown', payload: {}, required_inputs: [] }
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(400)
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })

  it('marks completed on a successful send_to_email execution', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: { destination_email: 'x@y.com' }, required_inputs: [] }
    executeToolCallMock.mockResolvedValueOnce({ status: 'completed', data: 'sent' })
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(200)
    expect(updateCalls.some((u) => u.status === 'completed')).toBe(true)
  })

  it('propagates missing_connection as 409 and marks failed', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: { destination_email: 'x@y.com' }, required_inputs: [] }
    executeToolCallMock.mockResolvedValueOnce({ status: 'missing_connection', message: 'Gmail not connected', service: 'gmail' })
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(409)
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })

  it('propagates permission_denied as 403', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: { destination_email: 'x@y.com' }, required_inputs: [] }
    executeToolCallMock.mockResolvedValueOnce({ status: 'permission_denied', message: 'nope' })
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(403)
  })

  it('propagates requires_approval as 200 with requires_approval:true', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: { destination_email: 'x@y.com' }, required_inputs: [] }
    executeToolCallMock.mockResolvedValueOnce({ status: 'requires_approval', execution_id: 'appr-1' })
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.requires_approval).toBe(true)
  })

  it('catches executeToolCall throwing and returns 500 + marks failed', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: { destination_email: 'x@y.com' }, required_inputs: [] }
    executeToolCallMock.mockRejectedValueOnce(new Error('boom'))
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    expect(res.status).toBe(500)
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })

  it('short-circuits with the idempotent cached response on replay', async () => {
    mockAction = { id: 'a1', status: 'suggested', action_slug: 'add_to_memo', payload: {}, required_inputs: [] }
    mockIdempotencyResponse = {
      kind: 'response',
      response: new Response(JSON.stringify({ replayed: true }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    }
    const res = await POST(makeReq(), { params: { id: 'a1' } })
    const body = await res.json()
    expect(body.replayed).toBe(true)
  })
})
