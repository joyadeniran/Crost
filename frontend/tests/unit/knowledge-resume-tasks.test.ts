/**
 * Unit tests: lib/knowledge/resume-tasks.ts
 *
 * Root-cause fix RC2 of the "self-destructive flow": KB upload completion
 * previously fired no signal, so tasks blocked in needs_data waited forever.
 *
 * Contract:
 *  - resumeBlockedTasksAfterUpload resets the goal's needs_data tasks to
 *    'planned' (ownership-scoped: goal_id AND created_by) and appends an
 *    orc_note documenting the resume.
 *  - It then fires a CHAIN_REACTION dispatch with the internal-secret header.
 *  - If there are no needs_data tasks, it does NOT call dispatch.
 *  - All failures are non-fatal (never throws).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
process.env.WORKER_INTERNAL_SECRET = 'test-internal-secret'

let needsDataRows: any[] = []
const taskUpdates: Array<{ payload: any; filters: Record<string, any> }> = []

function makeBuilder(table: string) {
  const filters: Record<string, any> = {}
  const builder: any = {
    _table: table,
    _updatePayload: null as any,
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockImplementation(function (this: any, payload: any) {
      this._updatePayload = payload
      return this
    }),
    eq: vi.fn().mockImplementation(function (this: any, col: string, val: any) {
      filters[col] = val
      if (this._updatePayload && table === 'goal_tasks' && col === 'task_id') {
        taskUpdates.push({ payload: this._updatePayload, filters: { ...filters } })
      }
      return this
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation(function (this: any, resolve: any) {
      const data = table === 'goal_tasks' && !this._updatePayload ? needsDataRows : null
      return Promise.resolve({ data, error: null }).then(resolve)
    }),
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => makeBuilder(table)),
  })),
}))

vi.mock('@/lib/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { resumeBlockedTasksAfterUpload } from '@/lib/knowledge/resume-tasks'

describe('resumeBlockedTasksAfterUpload', () => {
  beforeEach(() => {
    needsDataRows = []
    taskUpdates.length = 0
    vi.mocked(fetch).mockReset()
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as any)
  })

  it('resets needs_data tasks to planned with an orc_note and fires CHAIN_REACTION', async () => {
    needsDataRows = [
      { task_id: 'task-1', status: 'needs_data', orc_notes: [{ ts: 't0', note: 'missing financials', action_taken: 'BLOCKED_AWAITING_DATA' }] },
      { task_id: 'task-2', status: 'needs_data', orc_notes: null },
    ]

    await resumeBlockedTasksAfterUpload('goal-1', 'user-1')

    // Both tasks reset to planned, notes appended (existing notes preserved)
    expect(taskUpdates).toHaveLength(2)
    for (const u of taskUpdates) {
      expect(u.payload.status).toBe('planned')
      const notes = u.payload.orc_notes
      expect(Array.isArray(notes)).toBe(true)
      expect(notes[notes.length - 1].action_taken).toBe('DATA_UPLOADED_RESUMING')
    }
    expect(taskUpdates[0].payload.orc_notes).toHaveLength(2) // preserved prior note

    // CHAIN_REACTION dispatch fired with the internal secret
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/api/goals/goal-1/dispatch')
    expect((init as any).headers['x-crost-internal-secret']).toBe('test-internal-secret')
    expect(JSON.parse((init as any).body).task_id).toBe('CHAIN_REACTION')
  })

  it('does not call dispatch when there are no needs_data tasks', async () => {
    needsDataRows = []
    await resumeBlockedTasksAfterUpload('goal-1', 'user-1')
    expect(taskUpdates).toHaveLength(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('never throws when dispatch fails', async () => {
    needsDataRows = [{ task_id: 'task-1', status: 'needs_data', orc_notes: [] }]
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    await expect(resumeBlockedTasksAfterUpload('goal-1', 'user-1')).resolves.toBeUndefined()
  })
})
