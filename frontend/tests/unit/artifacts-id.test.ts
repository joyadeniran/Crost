/**
 * Unit tests: app/api/artifacts/[id]/route.ts — GET/PATCH/DELETE (T7 + T3.2
 * immutability invariant: approved/active artifacts never mutate).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockArtifact: any = null
let mockUpdated: any = null
let mockUpdateError: any = null
let mockDeleteError: any = null
// Phase 5: captures the exact payload passed to artifacts.update() so tests
// can assert on server-derived fields (e.g. approved_by) independently of
// whatever the mockUpdated canned response says.
let capturedUpdatePayload: any = null
const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const removeMock = vi.fn(() => Promise.resolve({ error: null }))

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
        single: vi.fn(() => Promise.resolve({ data: mockArtifact, error: mockArtifact ? null : { message: 'not found' } })),
        update: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        then: (resolve: any) => Promise.resolve({ data: mockUpdated, error: mockUpdateError ?? mockDeleteError }).then(resolve),
      }
      // .update(...).eq(...).select().single() needs `single` to resolve mockUpdated after update call
      builder.update = vi.fn((payload: any) => {
        if (table === 'artifacts') capturedUpdatePayload = payload
        builder.single = vi.fn(() => Promise.resolve({ data: mockUpdated, error: mockUpdateError }))
        return builder
      })
      return builder
    }),
    storage: { from: vi.fn(() => ({ remove: removeMock })) },
  })),
}))

import { GET, PATCH, DELETE } from '@/app/api/artifacts/[id]/route'

beforeEach(() => {
  mockUser = { id: 'user-1' }
  mockArtifact = null
  mockUpdated = null
  mockUpdateError = null
  mockDeleteError = null
  capturedUpdatePayload = null
  insertMock.mockClear()
  removeMock.mockClear()
})

function makeGetReq() {
  return new NextRequest('http://localhost/api/artifacts/art-1')
}
function makePatchReq(body: any) {
  return new NextRequest('http://localhost/api/artifacts/art-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
function makeDeleteReq() {
  return new NextRequest('http://localhost/api/artifacts/art-1', { method: 'DELETE' })
}

describe('GET /api/artifacts/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await GET(makeGetReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a nonexistent or cross-user artifact', async () => {
    mockArtifact = null
    const res = await GET(makeGetReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 200 with artifact data for the owner', async () => {
    mockArtifact = { id: 'art-1', status: 'draft', created_by: 'user-1' }
    const res = await GET(makeGetReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
  })
})

describe('PATCH /api/artifacts/[id] — immutability (spec §9.4)', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await PATCH(makePatchReq({ title: 'x' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the artifact is not found or not owned', async () => {
    mockArtifact = null
    const res = await PATCH(makePatchReq({ title: 'x' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(404)
  })

  it('blocks field edits on an active (immutable) artifact with 409 ARTIFACT_IMMUTABLE', async () => {
    mockArtifact = { id: 'art-1', status: 'active', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    const res = await PATCH(makePatchReq({ title: 'New title' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ARTIFACT_IMMUTABLE')
  })

  it('blocks discarding a published (active/paused/deprecated) artifact with 422', async () => {
    mockArtifact = { id: 'art-1', status: 'active', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    const res = await PATCH(makePatchReq({ status: 'discarded' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(422)
  })

  it('blocks deprecating an unpublished (draft/review) artifact with 422', async () => {
    mockArtifact = { id: 'art-1', status: 'draft', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    const res = await PATCH(makePatchReq({ status: 'deprecated' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(422)
  })

  // Phase 5 fix (spec §9.4 line 655): "draft: ... Version increments on each
  // edit." versionBump previously only fired for status === 'review',
  // leaving draft-state field edits at a permanently stale version — a
  // direct contradiction of this spec line.
  it('bumps version on a field edit while in draft status (spec §9.4)', async () => {
    mockArtifact = { id: 'art-1', status: 'draft', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    mockUpdated = { id: 'art-1', title: 'New', version: 2, status: 'draft' }
    const res = await PATCH(makePatchReq({ title: 'New' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
    expect(capturedUpdatePayload.version).toBe(2)
  })

  it('bumps version on a field edit while in review status', async () => {
    mockArtifact = { id: 'art-1', status: 'review', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    mockUpdated = { id: 'art-1', title: 'New', version: 2, status: 'review' }
    const res = await PATCH(makePatchReq({ title: 'New' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.version).toBe(2)
  })

  it('allows a draft->review status transition and logs nothing for it (not in eventMap)', async () => {
    mockArtifact = { id: 'art-1', status: 'draft', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    mockUpdated = { id: 'art-1', status: 'review', version: 1 }
    const res = await PATCH(makePatchReq({ status: 'review' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
  })

  it('logs artifact_activated event on review->active transition', async () => {
    mockArtifact = { id: 'art-1', status: 'review', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    mockUpdated = { id: 'art-1', status: 'active', version: 1 }
    await PATCH(makePatchReq({ status: 'active' }), { params: { id: 'art-1' } })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'artifact_activated' }))
  })

  it('returns 400 for invalid zod status enum', async () => {
    mockArtifact = { id: 'art-1', status: 'draft', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
    const res = await PATCH(makePatchReq({ status: 'bogus_status' }), { params: { id: 'art-1' } })
    expect(res.status).toBe(400)
  })

  // Phase 5 fix (spec §9.4). Evidence: cloudsql_migration.sql:445-446 defines
  // artifacts.approved_by as TEXT (Firebase UID), but PatchSchema validated
  // it as z.string().uuid() — a format real Firebase UIDs fail — and no
  // frontend caller ever sent it (grep-confirmed), so it was permanently
  // null on every artifact. Root cause: approved_by was designed as client
  // input instead of a server-derived value at the moment of approval,
  // unlike published_at which the DB trigger already stamps server-side on
  // the same review->active transition.
  describe('approved_by (spec §9.4 — must be server-derived, not client input)', () => {
    it('sets approved_by to the authenticated user on a review->active transition, even if the client sends none', async () => {
      mockArtifact = { id: 'art-1', status: 'review', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
      mockUpdated = { id: 'art-1', status: 'active', version: 1, approved_by: 'user-1' }
      const res = await PATCH(makePatchReq({ status: 'active' }), { params: { id: 'art-1' } })
      expect(res.status).toBe(200)
      expect(capturedUpdatePayload.approved_by).toBe('user-1')
    })

    it('ignores a client-supplied approved_by value and overrides it with the authenticated user', async () => {
      mockArtifact = { id: 'art-1', status: 'review', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
      mockUpdated = { id: 'art-1', status: 'active', version: 1, approved_by: 'user-1' }
      await PATCH(
        makePatchReq({ status: 'active', approved_by: 'someone-else-entirely' }),
        { params: { id: 'art-1' } }
      )
      // The route must not forward a forged approved_by to the DB — it
      // should have been stripped/overridden before the update payload was
      // built, not merely overwritten after the fact.
      expect(capturedUpdatePayload.approved_by).toBe('user-1')
      expect(capturedUpdatePayload.approved_by).not.toBe('someone-else-entirely')
    })

    it('does not set approved_by for a status transition that is not into active (e.g. draft->review)', async () => {
      mockArtifact = { id: 'art-1', status: 'draft', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
      mockUpdated = { id: 'art-1', status: 'review', version: 1 }
      const res = await PATCH(makePatchReq({ status: 'review' }), { params: { id: 'art-1' } })
      expect(res.status).toBe(200)
      expect(capturedUpdatePayload.approved_by).toBeUndefined()
    })

    it('rejects a client-supplied approved_by field entirely via schema (unknown/stripped key)', async () => {
      mockArtifact = { id: 'art-1', status: 'draft', version: 1, created_by: 'user-1', title: 'T', department_slug: 'sales' }
      mockUpdated = { id: 'art-1', status: 'review', version: 1 }
      await PATCH(
        makePatchReq({ status: 'review', approved_by: 'x-forged-value' }),
        { params: { id: 'art-1' } }
      )
      expect(capturedUpdatePayload.approved_by).toBeUndefined()
    })
  })
})

describe('DELETE /api/artifacts/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await DELETE(makeDeleteReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the artifact does not exist', async () => {
    mockArtifact = null
    const res = await DELETE(makeDeleteReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when the artifact belongs to a different user', async () => {
    mockArtifact = { id: 'art-1', file_url: null, created_by: 'other-user', title: 'T', department_slug: 'sales', status: 'draft' }
    const res = await DELETE(makeDeleteReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(403)
  })

  it('blocks deleting an active/paused/deprecated artifact with 409 ARTIFACT_IMMUTABLE', async () => {
    mockArtifact = { id: 'art-1', file_url: null, created_by: 'user-1', title: 'T', department_slug: 'sales', status: 'active' }
    const res = await DELETE(makeDeleteReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('ARTIFACT_IMMUTABLE')
  })

  it('discards a draft artifact for its owner', async () => {
    mockArtifact = { id: 'art-1', file_url: null, created_by: 'user-1', title: 'T', department_slug: 'sales', status: 'draft' }
    const res = await DELETE(makeDeleteReq(), { params: { id: 'art-1' } })
    expect(res.status).toBe(200)
  })
})
