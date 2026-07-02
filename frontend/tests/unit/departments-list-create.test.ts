/**
 * Unit tests: app/api/departments/route.ts — GET (list) / POST (create/clone) (T7).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockRows: any[] = []
let mockExisting: any = null
let mockIdempotencyResponse: any = { kind: 'none' }

vi.mock('@/lib/department-lifecycle', () => ({ RESERVED_SLUGS: ['orchestrator', 'system'] }))

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

import { GET, POST } from '@/app/api/departments/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockRows = []
  mockExisting = null
  mockIdempotencyResponse = { kind: 'none' }
})

describe('GET /api/departments', () => {
  it('allows unauthenticated access for scope=templates', async () => {
    mockUser = null
    mockRows = [{ id: 't1', created_by: null }]
    const res = await GET(new NextRequest('http://localhost/api/departments?scope=templates'))
    expect(res.status).toBe(200)
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

function makePostReq(body: any) {
  return new NextRequest('http://localhost/api/departments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/departments', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makePostReq({ template_slug: 'sales' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid create payload (zod — persona_prompt too short)', async () => {
    const res = await POST(makePostReq({
      name: 'Sales', slug: 'sales', persona_prompt: 'short',
      model_provider: 'groq', model_name: 'x',
    }))
    expect(res.status).toBe(400)
  })

  it('rejects a reserved slug', async () => {
    const res = await POST(makePostReq({
      name: 'Orchestrator', slug: 'orchestrator', persona_prompt: 'x'.repeat(60),
      model_provider: 'groq', model_name: 'x',
    }))
    expect(res.status).toBe(400)
  })

  it('returns 409 when cloning a template the user already has', async () => {
    mockExisting = { id: 'existing-dept' }
    const res = await POST(makePostReq({ template_slug: 'sales' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('DEPARTMENT_ALREADY_EXISTS')
  })

  it('creates a valid new department (draft stage)', async () => {
    const res = await POST(makePostReq({
      name: 'Sales', slug: 'sales-team', persona_prompt: 'x'.repeat(60),
      model_provider: 'groq', model_name: 'llama',
    }))
    expect(res.status).toBe(201)
  })

  it('returns 409 on a duplicate slug for a fresh department', async () => {
    mockExisting = { id: 'existing' } // used for both maybeSingle calls in this mock
    const res = await POST(makePostReq({
      name: 'Sales', slug: 'sales-team', persona_prompt: 'x'.repeat(60),
      model_provider: 'groq', model_name: 'llama',
    }))
    expect(res.status).toBe(409)
  })
})
