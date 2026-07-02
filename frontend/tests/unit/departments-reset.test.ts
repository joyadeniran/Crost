/**
 * Unit tests: app/api/departments/[slug]/reset/route.ts (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockDept: any = null
const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'event_log') return { insert: insertMock }
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data: mockDept, error: null })),
        update: vi.fn(() => builder),
        then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
      }
      return builder
    }),
  })),
}))

import { POST } from '@/app/api/departments/[slug]/reset/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockDept = null
  insertMock.mockClear()
})

function makeReq() {
  return new NextRequest('http://localhost/api/departments/sales/reset', { method: 'POST' })
}

describe('POST /api/departments/[slug]/reset', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makeReq(), { params: { slug: 'sales' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the department is not found or not owned by the session user', async () => {
    mockDept = null
    const res = await POST(makeReq(), { params: { slug: 'sales' } })
    expect(res.status).toBe(404)
  })

  it('returns 400 when the department is not currently running', async () => {
    mockDept = { id: 'd1', name: 'Sales', slug: 'sales', status: 'idle', last_active_at: null, created_by: 'user-1' }
    const res = await POST(makeReq(), { params: { slug: 'sales' } })
    expect(res.status).toBe(400)
  })

  it('returns 400 when running but not yet stuck (< 30 min)', async () => {
    mockDept = { id: 'd1', name: 'Sales', slug: 'sales', status: 'running', last_active_at: new Date().toISOString(), created_by: 'user-1' }
    const res = await POST(makeReq(), { params: { slug: 'sales' } })
    expect(res.status).toBe(400)
  })

  it('resets a genuinely stuck department (>30 min) and logs the event', async () => {
    mockDept = {
      id: 'd1', name: 'Sales', slug: 'sales', status: 'running',
      last_active_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(), created_by: 'user-1',
    }
    const res = await POST(makeReq(), { params: { slug: 'sales' } })
    expect(res.status).toBe(200)
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'error' }))
  })
})
