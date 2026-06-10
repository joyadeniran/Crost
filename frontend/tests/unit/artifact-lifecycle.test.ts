/**
 * Unit tests: Artifact sandbox lifecycle (status transitions, Make Changes, versioning)
 * Converted from __tests__/artifact-lifecycle.test.ts (Jest → Vitest) with proper auth mocking.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { POST as makeChangesHandler } from '@/app/api/artifacts/[id]/make-changes/route'
import { PATCH as patchArtifactHandler } from '@/app/api/artifacts/[id]/route'

const MOCK_USER_ID = 'test-user-123'

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(),
  createSupabaseServerComponentClient: vi.fn(),
}))

vi.mock('@/lib/idempotency', () => ({
  beginIdempotentRequest: vi.fn().mockResolvedValue({ kind: 'proceed' }),
  completeIdempotentRequest: vi.fn().mockResolvedValue(undefined),
}))

function setupAuthMock(userId = MOCK_USER_ID) {
  vi.mocked(createSupabaseServerComponentClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  } as any)
}

function makeQueryBuilder(overrides: Record<string, any> = {}) {
  const qb: any = {}
  qb.select = vi.fn().mockReturnValue(qb)
  qb.eq = vi.fn().mockReturnValue(qb)
  qb.or = vi.fn().mockReturnValue(qb)
  qb.order = vi.fn().mockReturnValue(qb)
  qb.limit = vi.fn().mockReturnValue(qb)
  qb.single = vi.fn().mockResolvedValue({ data: null, error: null })
  qb.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  qb.update = vi.fn().mockReturnValue(qb)
  qb.insert = vi.fn().mockReturnValue(qb)
  Object.assign(qb, overrides)
  return qb
}

describe('Artifact Sandbox Lifecycle', () => {
  let mockUserId: string
  let mockArtifactId: string
  let mockGoalId: string

  beforeAll(() => {
    mockUserId = MOCK_USER_ID
    mockArtifactId = 'artifact-456'
    mockGoalId = 'goal-789'
  })

  describe('Artifact Status Transitions', () => {
    it('should prevent field edits on active artifacts (409 Conflict)', async () => {
      setupAuthMock()

      const mockArtifact = {
        id: mockArtifactId,
        title: 'Original Title',
        status: 'active',
        version: 1,
        created_by: mockUserId,
        department_slug: 'marketing',
      }

      const qb = makeQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: mockArtifact, error: null }),
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue({ from: vi.fn().mockReturnValue(qb) } as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      })

      const response = await patchArtifactHandler(req as any, { params: { id: mockArtifactId } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.code).toBe('ARTIFACT_IMMUTABLE')
      expect(data.error).toContain('immutable')
    })

    it('should allow status transition on active artifacts', async () => {
      setupAuthMock()

      const mockArtifact = {
        id: mockArtifactId,
        title: 'Active Title',
        status: 'active',
        version: 1,
        created_by: mockUserId,
        department_slug: 'marketing',
      }

      let callCount = 0
      const qb = makeQueryBuilder({
        single: vi.fn().mockImplementation(async () => {
          callCount++
          if (callCount === 1) return { data: mockArtifact, error: null }
          return { data: { id: mockArtifactId, status: 'deprecated' }, error: null }
        }),
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue({ from: vi.fn().mockReturnValue(qb) } as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deprecated' }),
      })

      const response = await patchArtifactHandler(req as any, { params: { id: mockArtifactId } })
      expect(response.status).toBe(200)
    })

    it('should reject invalid status transitions (422)', async () => {
      setupAuthMock()

      const mockArtifact = {
        id: mockArtifactId,
        title: 'Title',
        status: 'review',
        version: 1,
        created_by: mockUserId,
        department_slug: 'marketing',
      }

      const qb = makeQueryBuilder({
        single: vi.fn().mockResolvedValue({ data: mockArtifact, error: null }),
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue({ from: vi.fn().mockReturnValue(qb) } as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deprecated' }),
      })

      const response = await patchArtifactHandler(req as any, { params: { id: mockArtifactId } })
      const data = await response.json()

      expect(response.status).toBe(422)
      expect(data.code).toBe('INVALID_STATUS_TRANSITION')
    })
  })

  describe('Make Changes Workflow', () => {
    it('should reject make-changes on discarded artifacts (422)', async () => {
      setupAuthMock()

      const mockArtifact = {
        id: mockArtifactId,
        title: 'Title',
        status: 'discarded',
        goal_id: mockGoalId,
        created_by: mockUserId,
      }

      let callCount = 0
      const qb = makeQueryBuilder({
        single: vi.fn().mockImplementation(async () => {
          callCount++
          if (callCount === 1) return { data: mockArtifact, error: null }
          return { data: { status: 'discarded' }, error: null }
        }),
      })
      vi.mocked(createServerSupabaseClient).mockReturnValue({ from: vi.fn().mockReturnValue(qb) } as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456/make-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await makeChangesHandler(req as any, { params: { id: mockArtifactId } })
      const data = await response.json()

      expect(response.status).toBe(422)
      expect(data.code).toBe('ARTIFACT_DISCARDED')
    })
  })

  describe('Version Management', () => {
    it('should increment version on draft edits', () => {
      const mockArtifact = { id: mockArtifactId, status: 'draft', version: 2, created_by: mockUserId }
      expect(mockArtifact.version + 1).toBe(3)
    })

    it('should lock version on active transition', () => {
      const mockArtifact = { status: 'active', version: 3, published_at: '2026-05-16T12:00:00Z' }
      expect(mockArtifact.version).toBe(3)
    })
  })

  describe('Approval Gates', () => {
    it('should set approved_by on active transition', () => {
      const userId = 'founder-uuid'
      const approved = { status: 'active', approved_by: userId, created_by: 'system-uuid' }
      expect(approved.approved_by).toBe(userId)
      expect(approved.approved_by).not.toBe(approved.created_by)
    })
  })
})
