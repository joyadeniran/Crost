/**
 * Unit tests: app/api/knowledge/read/route.ts (T7 — dual-mode auth).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

process.env.WORKER_INTERNAL_SECRET = 'test-internal-secret'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockFile: any = null

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: mockFile, error: mockFile ? null : { message: 'not found' } })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/knowledge/read/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockFile = null
})

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/knowledge/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/knowledge/read', () => {
  it('returns 401 when unauthenticated and no internal secret', async () => {
    mockUser = null
    const res = await POST(makeReq({ file_id: 'f1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when file_id is missing on the session path', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the file does not exist or is not owned by the caller', async () => {
    mockFile = null
    const res = await POST(makeReq({ file_id: 'f1' }))
    expect(res.status).toBe(404)
  })

  it('returns the extracted content for the owning session user', async () => {
    mockFile = { id: 'f1', title: 'Doc', extracted_text: 'full text', extracted_summary: 'sum', category: 'legal' }
    const res = await POST(makeReq({ file_id: 'f1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.content).toBe('full text')
  })

  it('falls back to a placeholder message when extracted_text is empty', async () => {
    mockFile = { id: 'f1', title: 'Doc', extracted_text: null, extracted_summary: '', category: null }
    const res = await POST(makeReq({ file_id: 'f1' }))
    const body = await res.json()
    expect(body.content).toBe('No text content extracted for this file.')
  })

  it('trusted internal call requires both userId and file_id in the body', async () => {
    mockUser = null
    const res = await POST(makeReq({ file_id: 'f1' }, { 'x-crost-internal-secret': 'test-internal-secret' }))
    expect(res.status).toBe(400)
  })

  it('trusted internal call with userId + file_id bypasses session auth', async () => {
    mockUser = null
    mockFile = { id: 'f1', title: 'Doc', extracted_text: 'text', extracted_summary: '', category: null }
    const res = await POST(makeReq({ file_id: 'f1', userId: 'user-9' }, { 'x-crost-internal-secret': 'test-internal-secret' }))
    expect(res.status).toBe(200)
  })

  it('an invalid internal secret falls through to session auth', async () => {
    mockUser = null
    const res = await POST(makeReq({ file_id: 'f1' }, { 'x-crost-internal-secret': 'wrong' }))
    expect(res.status).toBe(401)
  })
})
