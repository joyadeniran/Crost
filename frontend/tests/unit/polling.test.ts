import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextDelay, retryAfterMs, startPolling } from '@/lib/polling'

describe('polling helpers', () => {
  it('backs off when unchanged and resets on change', () => {
    expect(nextDelay(4000, false)).toBe(6000)
    expect(nextDelay(25000, false)).toBe(30000)
    expect(nextDelay(30000, false)).toBe(30000)
    expect(nextDelay(30000, true)).toBe(4000)
  })
  it('parses Retry-After', () => {
    expect(retryAfterMs('120')).toBe(120000)
    expect(retryAfterMs('999999')).toBe(3600000)
    expect(retryAfterMs(null)).toBeNull()
    expect(retryAfterMs('abc')).toBeNull()
  })
})

describe('startPolling', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('stops when tick returns stop', async () => {
    const tick = vi.fn().mockResolvedValue('stop')
    startPolling(tick, { baseMs: 100 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(tick).toHaveBeenCalledTimes(1)
  })
  it('slows down while unchanged', async () => {
    const tick = vi.fn().mockResolvedValue('unchanged')
    const stop = startPolling(tick, { baseMs: 100, maxMs: 1000 })
    await vi.advanceTimersByTimeAsync(2000)
    stop()
    expect(tick.mock.calls.length).toBeLessThan(10)
  })
  it('honors retryAfterMs', async () => {
    const tick = vi.fn().mockResolvedValue({ retryAfterMs: 5000 })
    const stop = startPolling(tick, { baseMs: 100 })
    await vi.advanceTimersByTimeAsync(4000)
    expect(tick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(tick).toHaveBeenCalledTimes(2)
    stop()
  })
  it('respects max duration', async () => {
    const tick = vi.fn().mockResolvedValue('changed')
    startPolling(tick, { baseMs: 100, maxDurationMs: 500 })
    await vi.advanceTimersByTimeAsync(5000)
    expect(tick.mock.calls.length).toBeLessThanOrEqual(6)
  })
  it('runs the first tick immediately when asked', async () => {
    const tick = vi.fn().mockResolvedValue('stop')
    startPolling(tick, { baseMs: 5000, immediate: true })
    await vi.advanceTimersByTimeAsync(1)
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it('stop() cancels', async () => {
    const tick = vi.fn().mockResolvedValue('changed')
    const stop = startPolling(tick, { baseMs: 100 })
    stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(tick).not.toHaveBeenCalled()
  })
})
