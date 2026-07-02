/**
 * Unit tests: lib/log.ts (Phase 3 — structured JSON-lines logger).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { log } from '@/lib/log'

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

function parseLastCall(spy: ReturnType<typeof vi.spyOn>) {
  const [arg] = spy.mock.calls[spy.mock.calls.length - 1]
  return JSON.parse(arg as string)
}

describe('log', () => {
  it('info/debug/warn route to console.log/console.log/console.warn respectively', () => {
    log.debug('debug msg')
    expect(logSpy).toHaveBeenCalledTimes(1)

    log.info('info msg')
    expect(logSpy).toHaveBeenCalledTimes(2)

    log.warn('warn msg')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('error routes to console.error, not console.log', () => {
    log.error('boom')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('emits a single JSON line with level, message, timestamp', () => {
    log.info('hello')
    const parsed = parseLastCall(logSpy)
    expect(parsed.level).toBe('info')
    expect(parsed.message).toBe('hello')
    expect(typeof parsed.timestamp).toBe('string')
    expect(new Date(parsed.timestamp).toString()).not.toBe('Invalid Date')
  })

  it('merges arbitrary context fields (userId, goalId, taskId, module) into the line', () => {
    log.error('task failed', { userId: 'u1', goalId: 'g1', taskId: 't1', module: 'worker', extra: 42 })
    const parsed = parseLastCall(errorSpy)
    expect(parsed).toMatchObject({ userId: 'u1', goalId: 'g1', taskId: 't1', module: 'worker', extra: 42 })
  })

  it('omits undefined context fields cleanly (no "fields: undefined" key)', () => {
    log.info('no context')
    const parsed = parseLastCall(logSpy)
    expect(Object.keys(parsed).sort()).toEqual(['level', 'message', 'timestamp'])
  })
})
