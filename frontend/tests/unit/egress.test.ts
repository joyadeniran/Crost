/**
 * Unit tests: lib/egress.ts — in-memory egress accounting.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  approxBytes, currentEgressLabel, drainPending, egressSnapshot, getEgressLimits, pendingBytesToday,
  recordEgress, resetEgressForTests, restorePending, todayUtc, withEgressLabel,
} from '@/lib/egress'

const entry = (over: Partial<Parameters<typeof recordEgress>[0]> = {}) => ({
  label: 'GET /api/x', table: 'goals', op: 'select' as const, bytes: 100, rows: 1, ms: 1, ...over,
})

beforeEach(() => {
  resetEgressForTests()
  delete process.env.EGRESS_WARN_QUERY_BYTES
  delete process.env.EGRESS_MAX_QUERY_BYTES
  delete process.env.EGRESS_DEFAULT_ROW_LIMIT
})

describe('approxBytes', () => {
  it('measures UTF-8 JSON bytes', () => {
    expect(approxBytes([{ a: 'x' }])).toBe(Buffer.byteLength('[{"a":"x"}]'))
    expect(approxBytes('é')).toBe(Buffer.byteLength('"é"'))
  })
  it('is 0 for null/undefined and survives unserialisable input', () => {
    expect(approxBytes(null)).toBe(0)
    expect(approxBytes(undefined)).toBe(0)
    const cyc: any = {}; cyc.self = cyc
    expect(approxBytes(cyc)).toBe(0)
  })
})

describe('labels', () => {
  it('defaults to "unlabeled" and scopes a label to the async call tree', async () => {
    expect(currentEgressLabel()).toBe('unlabeled')
    await withEgressLabel('GET /api/goals', async () => {
      expect(currentEgressLabel()).toBe('GET /api/goals')
      await Promise.resolve()
      expect(currentEgressLabel()).toBe('GET /api/goals')
    })
    expect(currentEgressLabel()).toBe('unlabeled')
  })
})

describe('limits', () => {
  it('has safe defaults: 64KB warn, 5MB hard, 500 rows', () => {
    expect(getEgressLimits()).toEqual({ warnQueryBytes: 64 * 1024, maxQueryBytes: 5 * 1024 * 1024, defaultRowLimit: 500 })
  })
  it('reads overrides and ignores garbage', () => {
    process.env.EGRESS_DEFAULT_ROW_LIMIT = '50'
    process.env.EGRESS_MAX_QUERY_BYTES = 'lots'
    const l = getEgressLimits()
    expect(l.defaultRowLimit).toBe(50)
    expect(l.maxQueryBytes).toBe(5 * 1024 * 1024)
  })
})

describe('recordEgress', () => {
  it('aggregates bytes and calls per label for today', () => {
    recordEgress(entry({ bytes: 100 }))
    recordEgress(entry({ bytes: 50 }))
    recordEgress(entry({ label: 'GET /api/y', bytes: 10 }))
    const snap = egressSnapshot()
    expect(snap.day).toBe(todayUtc())
    expect(snap.totalBytes).toBe(160)
    expect(snap.totalCalls).toBe(3)
    expect(snap.byLabel[0]).toEqual({ label: 'GET /api/x', bytes: 150, calls: 2 })
  })

  it('logs a structured warning and remembers the biggest queries when over the warn threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    recordEgress(entry({ bytes: 10, label: 'small' }))
    expect(warn).not.toHaveBeenCalled()
    recordEgress(entry({ bytes: 200 * 1024, label: 'GET /api/artifacts', table: 'artifacts', rows: 40 }))
    expect(warn).toHaveBeenCalledTimes(1)
    const line = String(warn.mock.calls[0][0])
    expect(line).toContain('[egress]')
    expect(JSON.parse(line.replace('[egress] ', ''))).toMatchObject({ level: 'large_query', table: 'artifacts', rows: 40 })
    expect(egressSnapshot().biggestQueries[0]).toMatchObject({ label: 'GET /api/artifacts', bytes: 200 * 1024 })
  })

  it('keeps only the 10 biggest', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 15; i++) recordEgress(entry({ bytes: 100 * 1024 + i }))
    const big = egressSnapshot().biggestQueries
    expect(big).toHaveLength(10)
    expect(big[0].bytes).toBe(100 * 1024 + 14)
  })
})

describe('pending / drain / restore', () => {
  it('drain returns everything once and clears pending', () => {
    recordEgress(entry({ bytes: 100 }))
    recordEgress(entry({ label: 'b', bytes: 5 }))
    expect(pendingBytesToday()).toBe(105)
    const rows = drainPending()
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.label === 'GET /api/x')).toMatchObject({ bytes: 100, calls: 1, day: todayUtc() })
    expect(drainPending()).toEqual([])
    expect(pendingBytesToday()).toBe(0)
    // totals (this instance's view) are unaffected by draining
    expect(egressSnapshot().totalBytes).toBe(105)
  })

  it('restore puts rows back (a failed flush must not lose bytes) and merges with new ones', () => {
    recordEgress(entry({ bytes: 100 }))
    const rows = drainPending()
    recordEgress(entry({ bytes: 1 }))
    restorePending(rows)
    const again = drainPending()
    expect(again).toHaveLength(1)
    expect(again[0]).toMatchObject({ bytes: 101, calls: 2 })
  })
})
