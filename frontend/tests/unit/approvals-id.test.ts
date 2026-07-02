/**
 * Unit tests: app/api/approvals/[id]/route.ts (T7 auth matrix).
 * GET fully covered; PATCH covered for its auth/rate-limit/ownership/validation
 * gates (the downstream execution engine is out of scope for T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockApproval: any = null
let mockRateLimitAllowed = true

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      or: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: mockApproval, error: null })),
      update: vi.fn(() => builder),
      insert: vi.fn(() => Promise.resolve({ error: null })),
      single: vi.fn(() => Promise.resolve({ data: mockApproval, error: null })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => (mockRateLimitAllowed ? { allowed: true } : { allowed: false, retryAfterSeconds: 30 })),
}))

import { GET, PATCH } from '@/app/api/approvals/[id]/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockApproval = null
  mockRateLimitAllowed = true
})

function makeGetReq() {
  return new NextRequest('http://localhost/api/approvals/appr-1')
}
function makePatchReq(body: any) {
  return new NextRequest('http://localhost/api/approvals/appr-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/approvals/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(makeGetReq(), { params: { id: 'appr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the approval does not exist or belongs to another user', async () => {
    mockApproval = null
    const res = await GET(makeGetReq(), { params: { id: 'appr-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 200 with the approval data for the owner', async () => {
    mockApproval = { id: 'appr-1', created_by: 'user-1', status: 'pending' }
    const res = await GET(makeGetReq(), { params: { id: 'appr-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockApproval)
  })
})

describe('PATCH /api/approvals/[id] — auth/validation gates', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await PATCH(makePatchReq({ decision: 'approved' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockRateLimitAllowed = false
    const res = await PATCH(makePatchReq({ decision: 'approved' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(429)
  })

  it('returns 400 on invalid decision payload (zod validation)', async () => {
    const res = await PATCH(makePatchReq({ decision: 'maybe' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the approval record does not exist', async () => {
    mockApproval = null
    const res = await PATCH(makePatchReq({ decision: 'approved' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the approval belongs to a different user', async () => {
    mockApproval = { id: 'appr-1', user_id: 'other-user', created_by: 'other-user', status: 'pending' }
    const res = await PATCH(makePatchReq({ decision: 'approved' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(403)
  })

  it('returns 409 when the approval is not in pending status', async () => {
    mockApproval = { id: 'appr-1', user_id: 'user-1', created_by: 'user-1', status: 'approved' }
    const res = await PATCH(makePatchReq({ decision: 'rejected' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(409)
  })

  it('rejecting a pending owned approval proceeds past all gates (200)', async () => {
    mockApproval = {
      id: 'appr-1', user_id: 'user-1', created_by: 'user-1', status: 'pending',
      action_type: 'gmail_send_email', payload: {}, department_id: 'dept-1',
    }
    const res = await PATCH(makePatchReq({ decision: 'rejected' }), { params: { id: 'appr-1' } })
    expect(res.status).toBe(200)
  })
})
