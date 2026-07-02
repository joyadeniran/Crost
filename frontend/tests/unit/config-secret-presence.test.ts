/**
 * Unit tests: app/api/config/secret-presence/route.ts (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockRows: any[] = []
let mockError: any = null

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      ilike: vi.fn(() => Promise.resolve({ data: mockRows, error: mockError })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { GET } from '@/app/api/config/secret-presence/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockRows = []
  mockError = null
})

function makeReq() {
  return new NextRequest('http://localhost/api/config/secret-presence')
}

describe('GET /api/config/secret-presence', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })

  it('never leaks the actual secret value — only true/false presence', async () => {
    mockRows = [{ key: 'openai_api_key', value: 'sk-actual-secret-value-123' }]
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.presence.openai_api_key).toBe(true)
    expect(JSON.stringify(body)).not.toContain('sk-actual-secret-value-123')
  })

  it('reports false for empty or very short values', async () => {
    mockRows = [{ key: 'x_api_key', value: '' }, { key: 'y_api_key', value: 'ab' }]
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.presence.x_api_key).toBe(false)
    expect(body.presence.y_api_key).toBe(false)
  })

  it('returns an empty presence object when the user has no configured keys', async () => {
    mockRows = []
    const res = await GET(makeReq())
    const body = await res.json()
    expect(body.presence).toEqual({})
  })

  it('returns 500 when the query errors', async () => {
    mockError = { message: 'db down' }
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
  })
})
