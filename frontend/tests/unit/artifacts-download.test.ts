/**
 * Unit tests: app/api/artifacts/[id]/download/route.ts (T7 + GCS double-prefix
 * regression, commit d32b0ca — private bucket, signed/proxied download).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockArtifact: any = null
let mockGetObjectResult: any = { data: null, error: null }
const getObjectMock = vi.fn((path: string) => Promise.resolve(mockGetObjectResult))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: mockArtifact, error: mockArtifact ? null : { message: 'not found' } })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

vi.mock('@/lib/gcs', () => ({
  gcsStorage: { from: vi.fn(() => ({ getObject: getObjectMock })) },
}))

import { GET } from '@/app/api/artifacts/[id]/download/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockArtifact = null
  mockGetObjectResult = { data: null, error: null }
  getObjectMock.mockClear()
})

function makeReq() {
  return new NextRequest('http://localhost/api/artifacts/art-1/download')
}

describe('GET /api/artifacts/[id]/download', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a nonexistent or cross-user artifact', async () => {
    mockArtifact = null
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the artifact has no file_url', async () => {
    mockArtifact = { id: 'art-1', file_url: null, title: 'T', created_by: 'user-1' }
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 422 for a file_url with no recognizable /artifacts/ marker', async () => {
    mockArtifact = { id: 'art-1', file_url: 'https://storage.googleapis.com/other-bucket/foo.pdf', title: 'T', created_by: 'user-1' }
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(422)
  })

  it('derives the object path after the /artifacts/ marker, single-prefixed', async () => {
    mockArtifact = { id: 'art-1', file_url: 'https://storage.googleapis.com/bucket/artifacts/goals/g1/report.pdf', title: 'T', created_by: 'user-1' }
    mockGetObjectResult = { data: Buffer.from('pdf bytes'), error: null }
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
    expect(getObjectMock).toHaveBeenCalledWith('goals/g1/report.pdf')
  })

  it('does not choke on legacy double-prefixed URLs — passes the raw remainder through (gcsStorage collapses it)', async () => {
    mockArtifact = { id: 'art-1', file_url: 'https://storage.googleapis.com/bucket/artifacts/artifacts/goals/g1/report.pdf', title: 'T', created_by: 'user-1' }
    mockGetObjectResult = { data: Buffer.from('pdf bytes'), error: null }
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
    // The route itself does NOT strip the double prefix — it hands the raw
    // remainder to gcsStorage.getObject(), which is documented to collapse it.
    expect(getObjectMock).toHaveBeenCalledWith('artifacts/goals/g1/report.pdf')
  })

  it('sets Content-Type by extension and Content-Disposition attachment header', async () => {
    mockArtifact = { id: 'art-1', file_url: 'https://storage.googleapis.com/bucket/artifacts/report.docx', title: 'T', created_by: 'user-1' }
    mockGetObjectResult = { data: Buffer.from('docx bytes'), error: null }
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns 404 when the object is missing from GCS', async () => {
    mockArtifact = { id: 'art-1', file_url: 'https://storage.googleapis.com/bucket/artifacts/missing.pdf', title: 'T', created_by: 'user-1' }
    mockGetObjectResult = { data: null, error: { message: 'not found' } }
    const res = await GET(makeReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(404)
  })
})
