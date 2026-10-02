/**
 * Unit tests: lib/egress-ledger.ts — persistence + daily budget levels.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { recordEgress, resetEgressForTests, pendingBytesToday } from '@/lib/egress'
import {
  BUDGET_SHED, BUDGET_WARN, currentBudgetState, dailyBudgetBytes, flushEgressLedger, levelFor,
  maybeFlushEgressLedger, refreshBudget, resetBudgetCacheForTests, secondsUntilReset,
} from '@/lib/egress-ledger'

const rec = (bytes: number, label = 'GET /api/x') =>
  recordEgress({ label, table: 't', op: 'select', bytes, rows: 1, ms: 1 })

const MB = 1024 * 1024

beforeEach(() => {
  resetEgressForTests()
  resetBudgetCacheForTests()
  delete process.env.EGRESS_DAILY_BUDGET_MB
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('flushEgressLedger', () => {
  it('upserts pending counters additively in one statement and clears pending', async () => {
    rec(100); rec(50); rec(7, 'GET /api/y')
    const query = vi.fn().mockResolvedValue({ rows: [] })
    await flushEgressLedger({ query })
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/INSERT INTO egress_ledger/)
    expect(sql).toMatch(/ON CONFLICT \(day, label\) DO UPDATE/)
    expect(sql).toMatch(/bytes = egress_ledger\.bytes \+ EXCLUDED\.bytes/)
    expect(params).toHaveLength(8) // 2 labels x (day,label,bytes,calls)
    expect(pendingBytesToday()).toBe(0)
  })

  it('does nothing (no query) when nothing is pending', async () => {
    const query = vi.fn()
    await flushEgressLedger({ query })
    expect(query).not.toHaveBeenCalled()
  })

  it('never throws and never loses bytes when the write fails', async () => {
    rec(500)
    const query = vi.fn().mockRejectedValue(new Error('relation "egress_ledger" does not exist'))
    await expect(flushEgressLedger({ query })).resolves.toBeUndefined()
    expect(pendingBytesToday()).toBe(500)
  })

  it('coalesces concurrent flushes', async () => {
    rec(10)
    let release!: () => void
    const query = vi.fn(() => new Promise<{ rows: any[] }>((res) => { release = () => res({ rows: [] }) }))
    const a = flushEgressLedger({ query })
    const b = flushEgressLedger({ query })
    release()
    await Promise.all([a, b])
    expect(query).toHaveBeenCalledTimes(1)
  })
})

describe('maybeFlushEgressLedger throttling', () => {
  it('flushes the first time, then waits for the interval; large backlogs flush immediately', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    const t0 = Date.now()
    rec(10)
    await maybeFlushEgressLedger({ query }, t0 + 60_000)
    expect(query).toHaveBeenCalledTimes(1)

    rec(10)
    expect(maybeFlushEgressLedger({ query }, Date.now())).toBeNull() // just flushed
    rec(2 * MB) // big backlog → flush regardless of the interval
    await maybeFlushEgressLedger({ query }, Date.now())
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('backs off after a failure so a missing table does not spam', async () => {
    const query = vi.fn().mockRejectedValue(new Error('boom'))
    rec(10)
    await maybeFlushEgressLedger({ query }, Date.now() + 60_000)
    expect(query).toHaveBeenCalledTimes(1)
    expect(maybeFlushEgressLedger({ query }, Date.now() + 120_000)).toBeNull()
  })
})

describe('budget levels', () => {
  it('defaults to 100 MB/day; 0 disables', () => {
    expect(dailyBudgetBytes()).toBe(100 * MB)
    process.env.EGRESS_DAILY_BUDGET_MB = '0'
    expect(dailyBudgetBytes()).toBe(0)
    expect(levelFor(10 * 1024 * MB, 0)).toBe('off')
  })

  it('maps usage fractions to ok / warn / shed / block', () => {
    const b = 100 * MB
    expect(levelFor(0, b)).toBe('ok')
    expect(levelFor(b * (BUDGET_WARN - 0.01), b)).toBe('ok')
    expect(levelFor(b * BUDGET_WARN, b)).toBe('warn')
    expect(levelFor(b * BUDGET_SHED, b)).toBe('shed')
    expect(levelFor(b, b)).toBe('block')
    expect(levelFor(b * 3, b)).toBe('block')
  })

  it('refreshBudget sums today\'s ledger and the unflushed local bytes', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ bytes: String(60 * MB) }] })
    rec(35 * MB) // unflushed
    const state = await refreshBudget({ query })
    expect(state.usedBytes).toBe(95 * MB)
    expect(state.level).toBe('shed')
    expect(query.mock.calls[0][0]).toMatch(/FROM egress_ledger WHERE day = \$1::date/)
  })

  it('caches the ledger read for a minute', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ bytes: '0' }] })
    const now = new Date()
    await refreshBudget({ query }, now)
    await refreshBudget({ query }, new Date(now.getTime() + 30_000))
    expect(query).toHaveBeenCalledTimes(1)
    await refreshBudget({ query }, new Date(now.getTime() + 61_000))
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('reacts immediately to local bytes without waiting for a ledger refresh', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ bytes: '0' }] })
    await refreshBudget({ query })
    expect(currentBudgetState().level).toBe('ok')
    rec(101 * MB)
    expect(currentBudgetState().level).toBe('block')
  })

  it('fails OPEN when the ledger is unreadable', async () => {
    const query = vi.fn().mockRejectedValue(new Error('down'))
    const state = await refreshBudget({ query })
    expect(state.level).toBe('ok')
  })

  it('does not query at all when the budget is disabled', async () => {
    process.env.EGRESS_DAILY_BUDGET_MB = '0'
    const query = vi.fn()
    const state = await refreshBudget({ query })
    expect(query).not.toHaveBeenCalled()
    expect(state.level).toBe('off')
  })
})

describe('secondsUntilReset', () => {
  it('counts down to the next UTC midnight', () => {
    expect(secondsUntilReset(new Date('2026-10-02T23:59:00Z'))).toBe(60)
    expect(secondsUntilReset(new Date('2026-10-02T00:00:00Z'))).toBe(86_400)
  })
})
