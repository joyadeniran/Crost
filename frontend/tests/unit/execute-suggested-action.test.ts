/**
 * Unit tests: lib/execute-suggested-action.ts — executeSuggestedAction gateway.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockActionRow: any = null
let mockFetchErr: any = null
const updateCalls: any[] = []

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data: mockActionRow, error: mockFetchErr })),
        update: vi.fn((payload: any) => {
          updateCalls.push(payload)
          return builder
        }),
      }
      return builder
    }),
  })),
}))

const executeToolCallMock = vi.fn()
vi.mock('@/lib/tools/execute-tool-call', () => ({
  executeToolCall: (...args: any[]) => executeToolCallMock(...args),
}))

const logEventMock = vi.fn(() => Promise.resolve())
vi.mock('@/lib/llm-client', () => ({
  logEvent: (...args: any[]) => logEventMock(...args),
}))

import { executeSuggestedAction } from '@/lib/execute-suggested-action'

beforeEach(() => {
  mockActionRow = null
  mockFetchErr = null
  updateCalls.length = 0
  executeToolCallMock.mockReset()
  logEventMock.mockClear()
  vi.mocked(global.fetch as any)?.mockReset?.()
})

describe('executeSuggestedAction', () => {
  it('returns an error when the action row is not found', async () => {
    mockActionRow = null
    mockFetchErr = { message: 'no rows' }
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/)
  })

  it('rejects execution when the action is not in an executable status', async () => {
    mockActionRow = { id: 'a1', status: 'completed', action_slug: 'send_to_email' }
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/already completed/)
  })

  it('marks failed for an unknown action_slug', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'not_a_real_slug' }
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Unknown action slug/)
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })

  it('accepts "suggested", "generated", and "tapped" as executable start states', async () => {
    for (const status of ['suggested', 'generated', 'tapped']) {
      mockActionRow = { id: 'a1', status, action_slug: 'send_to_email', payload: { target_email: 'x@y.com' } }
      executeToolCallMock.mockResolvedValueOnce({ status: 'completed', data: 'ok' })
      const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
      expect(result.success).toBe(true)
    }
  })

  it('builds gmail send_email params from payload for send_to_email', async () => {
    mockActionRow = {
      id: 'a1', status: 'suggested', action_slug: 'send_to_email',
      payload: { target_email: 'x@y.com', subject: 'Hi', body: 'Body' },
    }
    executeToolCallMock.mockResolvedValueOnce({ status: 'completed', data: 'sent' })
    await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(executeToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        departmentId: 'executive',
        toolCall: expect.objectContaining({
          service: 'gmail',
          action: 'send_email',
          params: { to: 'x@y.com', subject: 'Hi', body: 'Body' },
        }),
      }),
    )
  })

  it('propagates missing_connection as a failure and marks the row failed', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: {} }
    executeToolCallMock.mockResolvedValueOnce({ status: 'missing_connection', message: 'Gmail not connected' })
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Gmail not connected')
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })

  it('propagates permission_denied as a failure', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: {} }
    executeToolCallMock.mockResolvedValueOnce({ status: 'permission_denied', message: 'Not allowed' })
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Not allowed')
  })

  it('requires_approval returns success:true with approval_needed status, and updates row with approval_id', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: {} }
    executeToolCallMock.mockResolvedValueOnce({ status: 'requires_approval', execution_id: 'appr-1' })
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(true)
    expect((result.result as any).status).toBe('approval_needed')
    expect(updateCalls.some((u) => u.approval_id === 'appr-1')).toBe(true)
  })

  it('marks completed with a truncated string result as result_summary', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: {} }
    executeToolCallMock.mockResolvedValueOnce({ status: 'completed', data: 'x'.repeat(600) })
    await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    const completedUpdate = updateCalls.find((u) => u.status === 'completed')
    expect(completedUpdate.result_summary.length).toBe(500)
  })

  it('catches executeToolCall throwing and marks the row failed', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'send_to_email', payload: {} }
    executeToolCallMock.mockRejectedValueOnce(new Error('boom'))
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('boom')
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })

  it('make_changes requires artifact_id in payload', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'make_changes', payload: {} }
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/artifact_id required/)
  })

  it('make_changes calls the make-changes API and marks completed on success', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'make_changes', payload: { artifact_id: 'art-1' } }
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { artifact_id: 'art-2', new_task_id: 'task-9' } }),
      }),
    ) as any
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(true)
    expect(updateCalls.some((u) => u.status === 'completed')).toBe(true)
  })

  it('make_changes marks failed when the API responds non-ok', async () => {
    mockActionRow = { id: 'a1', status: 'suggested', action_slug: 'make_changes', payload: { artifact_id: 'art-1' } }
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('server error') }),
    ) as any
    const result = await executeSuggestedAction({ actionId: 'a1', userId: 'u1' })
    expect(result.success).toBe(false)
    expect(updateCalls.some((u) => u.status === 'failed')).toBe(true)
  })
})
