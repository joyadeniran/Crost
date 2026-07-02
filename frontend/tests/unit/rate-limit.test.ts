/**
 * Unit tests: lib/rate-limit.ts — in-memory checkRateLimit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limit'

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('allows the first request for a new user (new window)', () => {
    const result = checkRateLimit('user-a', 3, 60000)
    expect(result.allowed).toBe(true)
  })

  it('allows requests under the limit', () => {
    checkRateLimit('user-b', 3, 60000)
    checkRateLimit('user-b', 3, 60000)
    const result = checkRateLimit('user-b', 3, 60000)
    expect(result.allowed).toBe(true)
  })

  it('blocks requests once the limit is reached, with retryAfterSeconds', () => {
    checkRateLimit('user-c', 2, 60000)
    checkRateLimit('user-c', 2, 60000)
    const result = checkRateLimit('user-c', 2, 60000)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('resets the window after resetAt passes', () => {
    checkRateLimit('user-d', 1, 1000)
    let result = checkRateLimit('user-d', 1, 1000)
    expect(result.allowed).toBe(false)

    vi.advanceTimersByTime(1001)
    result = checkRateLimit('user-d', 1, 1000)
    expect(result.allowed).toBe(true)
  })

  it('isolates rate limit state per userId', () => {
    checkRateLimit('user-e', 1, 60000)
    const blocked = checkRateLimit('user-e', 1, 60000)
    expect(blocked.allowed).toBe(false)

    const otherUser = checkRateLimit('user-f', 1, 60000)
    expect(otherUser.allowed).toBe(true)
  })

  it('uses default limit (60) and window (60000ms) when not specified', () => {
    const result = checkRateLimit('user-g')
    expect(result.allowed).toBe(true)
  })
})
