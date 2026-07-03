/**
 * Unit tests: lib/engine/memo.ts — saveContextMemo (Phase 5, spec §8).
 * First coverage of this function. Scoped to the dual-write-failure-
 * visibility fix — same pattern as the identical fix in
 * lib/engine/orchestrator.ts's runOrcReport (see orchestrator-report.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn(() => Promise.resolve({ error: null }))
const logDecisionMock = vi.fn(() => Promise.resolve())
const logWarnMock = vi.fn()
const logErrorMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: insertMock })),
  })),
}))

vi.mock('@/lib/company-memo', () => ({
  logDecision: (...args: any[]) => logDecisionMock(...args),
}))

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: (...args: any[]) => logWarnMock(...args), error: (...args: any[]) => logErrorMock(...args) },
}))

import { saveContextMemo } from '@/lib/engine/memo'

beforeEach(() => {
  insertMock.mockClear()
  insertMock.mockResolvedValue({ error: null })
  logDecisionMock.mockClear()
  logDecisionMock.mockResolvedValue(undefined)
  logWarnMock.mockClear()
  logErrorMock.mockClear()
})

describe('saveContextMemo — dual-write failure visibility (spec §8)', () => {
  it('logs a warning when the company_memo dual-write (logDecision) fails, instead of swallowing it silently', async () => {
    logDecisionMock.mockRejectedValueOnce(new Error('db unavailable'))
    await saveContextMemo('goal-1', 'Some clarification content', 'user-1')
    await new Promise((r) => setTimeout(r, 0))
    expect(logWarnMock).toHaveBeenCalled()
    const [message, fields] = logWarnMock.mock.calls[0]
    expect(message).toContain('logDecision')
    expect(fields).toEqual(expect.objectContaining({ goalId: 'goal-1', userId: 'user-1' }))
  })

  it('does not log a warning when the dual-write succeeds', async () => {
    await saveContextMemo('goal-1', 'Some clarification content', 'user-1')
    await new Promise((r) => setTimeout(r, 0))
    expect(logWarnMock).not.toHaveBeenCalled()
  })

  it('skips the dual-write entirely (and does not error) when userId is null', async () => {
    await saveContextMemo('goal-1', 'Some clarification content', null)
    await new Promise((r) => setTimeout(r, 0))
    expect(logDecisionMock).not.toHaveBeenCalled()
    expect(logWarnMock).not.toHaveBeenCalled()
  })
})
