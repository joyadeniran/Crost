/**
 * Unit tests: lib/dual-write-log.ts — logDualWriteFailure (Phase 5, spec §8).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const logWarnMock = vi.fn()
vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: (...args: any[]) => logWarnMock(...args), error: vi.fn() },
}))

import { logDualWriteFailure } from '@/lib/dual-write-log'

beforeEach(() => {
  logWarnMock.mockClear()
})

describe('logDualWriteFailure', () => {
  it('logs a warning with the source, context, and stringified error when the promise rejects', async () => {
    logDualWriteFailure('executeToolCall', Promise.reject(new Error('db unavailable')), { goalId: 'g1', taskId: 't1' })
    await new Promise((r) => setTimeout(r, 0))
    expect(logWarnMock).toHaveBeenCalledTimes(1)
    const [message, fields] = logWarnMock.mock.calls[0]
    expect(message).toBe('[executeToolCall] company_memo dual-write failed')
    expect(fields).toEqual(expect.objectContaining({ goalId: 'g1', taskId: 't1', error: 'Error: db unavailable' }))
  })

  it('does not log anything when the promise resolves', async () => {
    logDualWriteFailure('executeToolCall', Promise.resolve(undefined), { goalId: 'g1' })
    await new Promise((r) => setTimeout(r, 0))
    expect(logWarnMock).not.toHaveBeenCalled()
  })

  it('does not throw synchronously even though it never awaits the promise (fire-and-forget by design)', () => {
    expect(() => logDualWriteFailure('x', Promise.reject(new Error('boom')), {})).not.toThrow()
  })
})
