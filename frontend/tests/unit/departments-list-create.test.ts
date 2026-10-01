/**
 * Unit tests: app/api/departments/route.ts — GET (list). POST (create/clone) was removed with dynamic departments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockRows: any[] = []
let mockExisting: any = null
let mockIdempotencyResponse: any = { kind: 'none' }

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
      select: vi.fn(() => builder),
      is: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      or: vi.fn(() => builder),
      order: vi.fn(() => builder),
      then: (resolve: any) => Promise.resolve({ data: mockRows, error: null }).then(resolve),
      maybeSingle: vi.fn(() => Promise.resolve({ data: mockExisting, error: null })),
      insert: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: { id: 'dept-1', name: 'Sales', slug: 'sales' }, error: null })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { GET } from '@/app/api/departments/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockRows = []
  mockExisting = null
  mockIdempotencyResponse = { kind: 'none' }
})

describe('GET /api/departments', () => {
  it('returns 401 for scope=templates when unauthenticated (auth on every route)', async () => {
    mockUser = null
    mockRows = [{ id: 't1', created_by: null }]
    const res = await GET(new NextRequest('http://localhost/api/departments?scope=templates'))
    expect(res.status).toBe(401)
  })

  it('serves global templates for scope=templates when authenticated', async () => {
    mockRows = [{ id: 't1', created_by: null }]
    const res = await GET(new NextRequest('http://localhost/api/departments?scope=templates'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual(mockRows)
  })

  it('returns 401 for the default (user) scope when unauthenticated', async () => {
    mockUser = null
    const res = await GET(new NextRequest('http://localhost/api/departments'))
    expect(res.status).toBe(401)
  })

  it('returns the session user\'s departments when authenticated', async () => {
    mockRows = [{ id: 'd1', created_by: 'user-1', slug: 'sales' }]
    const res = await GET(new NextRequest('http://localhost/api/departments'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual(mockRows)
  })
})

describe('departments are fixed in the beta (no create/clone API)', () => {
  it('does not export POST — dynamic department creation was cut', async () => {
    const mod = await import('@/app/api/departments/route')
    expect((mod as any).POST).toBeUndefined()
  })
})
