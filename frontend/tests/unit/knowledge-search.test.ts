/**
 * Unit tests: app/api/knowledge/search/route.ts (T7 — dual-mode auth; T5 KB search).
 * Focused on the auth gate + direct-file-match happy path; semantic/keyword
 * fallback internals are exercised indirectly via the "no direct match" case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

process.env.WORKER_INTERNAL_SECRET = 'test-internal-secret'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockFiles: any[] = []

vi.mock('@/lib/llm-client', () => ({
  callEmbeddings: vi.fn(() => Promise.resolve([[0.1, 0.2]])),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      or: vi.fn(() => builder),
      ilike: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (resolve: any) => Promise.resolve({ data: mockFiles, error: null }).then(resolve),
      update: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
      rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    }
    return { from: vi.fn(() => builder), rpc: vi.fn(() => Promise.resolve({ data: [], error: null })) }
  }),
}))

import { POST } from '@/app/api/knowledge/search/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockFiles = []
})

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/knowledge/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/knowledge/search', () => {
  it('returns 401 when unauthenticated and no internal secret', async () => {
    mockUser = null
    const res = await POST(makeReq({ query: 'x' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when query is missing on the session path', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns matches humanized (no raw {matches} envelope surprises) for the session user', async () => {
    mockFiles = [{ id: 'f1', title: 'Handbook', category: 'handbook', tags: [], extracted_summary: 'summary', file_type: 'pdf', reference_count: 1, created_at: '' }]
    const res = await POST(makeReq({ query: 'handbook' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.matches).toHaveLength(1)
    expect(body.matches[0].title).toBe('Handbook')
  })

  it('trusted internal call requires userId + query in the body', async () => {
    mockUser = null
    const res = await POST(makeReq({ query: 'x' }, { 'x-crost-internal-secret': 'test-internal-secret' }))
    expect(res.status).toBe(400)
  })

  it('trusted internal call with userId + query bypasses session auth', async () => {
    mockUser = null
    mockFiles = [{ id: 'f1', title: 'Doc', category: null, tags: [], extracted_summary: '', file_type: 'pdf', reference_count: 0, created_at: '' }]
    const res = await POST(makeReq({ query: 'doc', userId: 'user-9' }, { 'x-crost-internal-secret': 'test-internal-secret' }))
    expect(res.status).toBe(200)
  })

  it('an invalid internal secret falls through to session auth (400 for missing query via session path)', async () => {
    mockUser = { id: 'user-1' }
    const res = await POST(makeReq({}, { 'x-crost-internal-secret': 'wrong' }))
    expect(res.status).toBe(400)
  })

  it('returns empty matches array (not an error) when nothing matches at all', async () => {
    mockFiles = []
    const res = await POST(makeReq({ query: 'nonexistent-topic-zzz' }))
    const body = await res.json()
    expect(body.matches).toEqual([])
  })
})
