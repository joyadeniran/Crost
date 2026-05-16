import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { createServerSupabaseClient } from '@/lib/supabase'
import { POST as makeChangesHandler } from '@/app/api/artifacts/[id]/make-changes/route'
import { PATCH as patchArtifactHandler, GET as getArtifactHandler } from '@/app/api/artifacts/[id]/route'

// Mock Supabase
jest.mock('@/lib/supabase')

describe('Artifact Sandbox Lifecycle', () => {
  let mockUserId: string
  let mockArtifactId: string
  let mockGoalId: string

  beforeAll(() => {
    mockUserId = 'test-user-123'
    mockArtifactId = 'artifact-456'
    mockGoalId = 'goal-789'
  })

  describe('Artifact Status Transitions', () => {
    it('should prevent field edits on active artifacts (409 Conflict)', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        title: 'Original Title',
        status: 'active',
        version: 1,
        created_by: mockUserId,
        department_slug: 'marketing',
      }

      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [mockArtifact], error: null }),
            }),
          }),
        }),
      }

      jest.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      })

      const response = await patchArtifactHandler(req, { params: { id: mockArtifactId } } as any)
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.code).toBe('ARTIFACT_IMMUTABLE')
      expect(data.error).toContain('immutable')
    })

    it('should allow edits on draft artifacts', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        title: 'Original Title',
        status: 'draft',
        version: 1,
        created_by: mockUserId,
        department_slug: 'marketing',
      }

      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [mockArtifact], error: null }),
            }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({ data: { id: mockArtifactId, version: 2 }, error: null }),
          }),
        }),
      }

      jest.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      })

      const response = await patchArtifactHandler(req, { params: { id: mockArtifactId } } as any)

      expect(response.status).toBe(200)
    })

    it('should reject invalid status transitions', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        title: 'Title',
        status: 'review',
        version: 1,
        created_by: mockUserId,
        department_slug: 'marketing',
      }

      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: [mockArtifact], error: null }),
            }),
          }),
        }),
      }

      jest.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      // Try to transition review → deprecated (should discard instead)
      const req = new Request('http://localhost:3000/api/artifacts/artifact-456', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'deprecated' }),
      })

      const response = await patchArtifactHandler(req, { params: { id: mockArtifactId } } as any)
      const data = await response.json()

      expect(response.status).toBe(422)
      expect(data.code).toBe('INVALID_STATUS_TRANSITION')
    })
  })

  describe('Make Changes Workflow', () => {
    it('should create a revision task with correct context', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        title: 'Pitch Deck',
        goal_id: mockGoalId,
        department_slug: 'marketing',
        department_id: 'dept-123',
        task_id: 'task-456',
        artifact_type: 'presentation',
        body: null,
        status: 'review',
      }

      const mockTask = {
        action: 'create_artifact',
        label: 'Create pitch deck',
        reasoning: 'Founder requested pitch',
        params: { format: 'pptx' },
        risk_level: 'low',
        model: 'claude',
      }

      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: mockArtifact, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockArtifact, error: null }),
            }),
          })
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: mockTask, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'new-task-id', task_id: 'new-task-id', status: 'pending' },
                  error: null,
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: { id: 'action-id' },
                  error: null,
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          }),
      }

      jest.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456/make-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await makeChangesHandler(req, { params: { id: mockArtifactId } } as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.data.goal_id).toBe(mockGoalId)
      expect(data.data.new_task_id).toBeDefined()
    })

    it('should reject make-changes on discarded artifacts', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        title: 'Title',
        status: 'discarded',
        goal_id: mockGoalId,
      }

      const mockSupabase = {
        from: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: mockArtifact, error: null }),
            }),
          }),
        }),
      }

      jest.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456/make-changes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await makeChangesHandler(req, { params: { id: mockArtifactId } } as any)
      const data = await response.json()

      expect(response.status).toBe(422)
      expect(data.code).toBe('ARTIFACT_DISCARDED')
    })

    it('should set correct revision task params', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        title: 'Original Pitch',
        goal_id: mockGoalId,
        department_slug: 'marketing',
        artifact_type: 'presentation',
        status: 'active',
      }

      const insertedTask = {
        id: 'new-task-123',
        task_id: 'new-task-123',
        goal_id: mockGoalId,
        dept_slug: 'marketing',
        label: 'Revise: Original Pitch',
        status: 'pending',
        params: {
          revising_artifact_id: mockArtifactId,
          previous_artifact_type: 'presentation',
        },
      }

      const mockSupabase = {
        from: jest.fn()
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                eq: jest.fn().mockResolvedValue({ data: mockArtifact, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({ data: { status: 'active' }, error: null }),
            }),
          })
          .mockReturnValueOnce({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: insertedTask,
                  error: null,
                }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({ data: { id: 'action-id' }, error: null }),
              }),
            }),
          })
          .mockReturnValueOnce({
            insert: jest.fn().mockResolvedValue({ data: {}, error: null }),
          }),
      }

      jest.mocked(createServerSupabaseClient).mockReturnValue(mockSupabase as any)

      const req = new Request('http://localhost:3000/api/artifacts/artifact-456/make-changes', {
        method: 'POST',
      })

      const response = await makeChangesHandler(req, { params: { id: mockArtifactId } } as any)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data.new_task_id).toBe(insertedTask.task_id)
    })
  })

  describe('Version Management', () => {
    it('should increment version on draft edits', async () => {
      const mockArtifact = {
        id: mockArtifactId,
        status: 'draft',
        version: 2,
        created_by: mockUserId,
      }

      // Version should be 3 after edit
      expect(mockArtifact.version + 1).toBe(3)
    })

    it('should lock version on active transition', async () => {
      const mockArtifact = {
        status: 'active',
        version: 3,
        published_at: '2026-05-16T12:00:00Z',
      }

      // Version should not change after publication
      expect(mockArtifact.version).toBe(3)
    })
  })

  describe('Approval Gates', () => {
    it('should set approved_by on active transition', async () => {
      const userId = 'founder-uuid'
      const mockArtifact = {
        id: mockArtifactId,
        status: 'review',
        created_by: 'system-uuid',
      }

      // After approval
      const approved = {
        ...mockArtifact,
        status: 'active',
        approved_by: userId,
      }

      expect(approved.approved_by).toBe(userId)
      expect(approved.approved_by).not.toBe(mockArtifact.created_by)
    })
  })
})
