/**
 * Unit tests: app/api/usage/today/route.ts (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockUsage: any[] = []
let mockKeys: any[] = []

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    let currentTable = ''
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      gte: vi.fn(() => Promise.resolve({ data: mockUsage })),
      limit: vi.fn(() => Promise.resolve({ data: mockKeys })),
    }
    return {
      from: vi.fn((table: string) => {
        currentTable = table
        return builder
      }),
    }
  }),
}))

import { GET } from '@/app/api/usage/today/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockUsage = []
  mockKeys = []
})

describe('GET /api/usage/today', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(new NextRequest('http://localhost/api/usage/today'))
    expect(res.status).toBe(401)
  })

  it('sums total_tokens across usage rows for the session user', async () => {
    mockUsage = [{ total_tokens: 100 }, { total_tokens: 250 }]
    const res = await GET(new NextRequest('http://localhost/api/usage/today'))
    const body = await res.json()
    expect(body.tokensUsed).toBe(350)
  })

  it('reports hasUserKey:false when no valid BYOK keys exist', async () => {
    mockKeys = []
    const res = await GET(new NextRequest('http://localhost/api/usage/today'))
    const body = await res.json()
    expect(body.hasUserKey).toBe(false)
  })

  it('reports hasUserKey:true when at least one valid key exists', async () => {
    mockKeys = [{ provider: 'openai' }]
    const res = await GET(new NextRequest('http://localhost/api/usage/today'))
    const body = await res.json()
    expect(body.hasUserKey).toBe(true)
  })

  it('includes limit from FREE_SYSTEM_DAILY_TOKENS and a resetAt timestamp', async () => {
    const res = await GET(new NextRequest('http://localhost/api/usage/today'))
    const body = await res.json()
    expect(body.limit).toBe(50000)
    expect(new Date(body.resetAt).toString()).not.toBe('Invalid Date')
  })
})
