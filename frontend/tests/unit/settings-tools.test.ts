/**
 * Unit tests: app/api/settings/tools/route.ts (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockTool: any = null
let mockUpdateError: any = null

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: mockTool, error: null })),
      update: vi.fn(() => builder),
      then: (resolve: any) => Promise.resolve({ error: mockUpdateError }).then(resolve),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/settings/tools/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockTool = null
  mockUpdateError = null
})

function makeReq(body: any) {
  return new NextRequest('http://localhost/api/settings/tools', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/settings/tools', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makeReq({ id: 'gmail_send', is_configured: true }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when id is missing', async () => {
    const res = await POST(makeReq({ is_configured: true }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when the tool row is owned by another user', async () => {
    mockTool = { user_id: 'other-user' }
    const res = await POST(makeReq({ id: 'gmail_send', is_configured: true }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when the tool does not exist at all', async () => {
    mockTool = null
    const res = await POST(makeReq({ id: 'gmail_send', is_configured: true }))
    expect(res.status).toBe(403)
  })

  it('allows updating a global tool row (user_id is null)', async () => {
    mockTool = { user_id: null }
    const res = await POST(makeReq({ id: 'gmail_send', is_configured: true }))
    expect(res.status).toBe(200)
  })

  it('allows updating a tool row owned by the session user', async () => {
    mockTool = { user_id: 'user-1' }
    const res = await POST(makeReq({ id: 'gmail_send', is_configured: false }))
    expect(res.status).toBe(200)
  })

  it('returns 500 when the update query errors', async () => {
    mockTool = { user_id: 'user-1' }
    mockUpdateError = { message: 'db error' }
    const res = await POST(makeReq({ id: 'gmail_send', is_configured: true }))
    expect(res.status).toBe(500)
  })
})
