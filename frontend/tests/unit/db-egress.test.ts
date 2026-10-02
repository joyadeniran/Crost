/**
 * Unit tests: lib/db.ts egress guards — default row cap, single() limit, hard byte cap,
 * metering/attribution.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('pg', () => ({
  Pool: class {
    query = queryMock
    on = vi.fn()
  },
}))
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }))

import { createDbClient } from '@/lib/db'
import { egressSnapshot, resetEgressForTests, withEgressLabel } from '@/lib/egress'

function lastSelect(): string {
  const calls = queryMock.mock.calls.filter(([sql]) => typeof sql === 'string' && /^SELECT/.test(sql))
  return calls[calls.length - 1][0] as string
}

beforeEach(() => {
  queryMock.mockReset()
  queryMock.mockResolvedValue({ rows: [{ id: 1 }] })
  resetEgressForTests()
  delete process.env.EGRESS_DEFAULT_ROW_LIMIT
  delete process.env.EGRESS_MAX_QUERY_BYTES
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('row caps', () => {
  it('applies the default row cap (500) to an unbounded select', async () => {
    await createDbClient().from('goals').select('id').eq('created_by', 'u1')
    expect(lastSelect()).toMatch(/LIMIT 500$/)
  })

  it('the default cap is configurable', async () => {
    process.env.EGRESS_DEFAULT_ROW_LIMIT = '25'
    await createDbClient().from('goals').select('id')
    expect(lastSelect()).toMatch(/LIMIT 25$/)
  })

  it('an explicit .limit() always wins', async () => {
    await createDbClient().from('goals').select('id').limit(7)
    expect(lastSelect()).toMatch(/LIMIT 7$/)
  })

  it('single() and maybeSingle() fetch at most one row', async () => {
    await createDbClient().from('goals').select('id').eq('id', 'g1').single()
    expect(lastSelect()).toMatch(/LIMIT 1$/)
    await createDbClient().from('goals').select('id').eq('id', 'g1').maybeSingle()
    expect(lastSelect()).toMatch(/LIMIT 1$/)
  })

  it('warns (structured) when an unbounded select hits the cap, not when it is explicit', async () => {
    process.env.EGRESS_DEFAULT_ROW_LIMIT = '2'
    queryMock.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }] })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await createDbClient().from('artifacts').select('id')
    expect(warn.mock.calls.some((c) => String(c[0]).includes('row_cap_hit'))).toBe(true)
    warn.mockClear()
    await createDbClient().from('artifacts').select('id').limit(2)
    expect(warn.mock.calls.some((c) => String(c[0]).includes('row_cap_hit'))).toBe(false)
  })
})

describe('hard byte cap', () => {
  it('fails a read that exceeds the emergency limit instead of returning it', async () => {
    process.env.EGRESS_MAX_QUERY_BYTES = '1000'
    queryMock.mockResolvedValue({ rows: [{ body: 'x'.repeat(5000) }] })
    const { data, error } = await createDbClient().from('artifacts').select('body').limit(1)
    expect(data).toBeNull()
    expect(error?.message).toMatch(/returned \d+ bytes \(limit 1000\)/)
  })

  it('still records the oversized bytes (so they show up in the ledger)', async () => {
    process.env.EGRESS_MAX_QUERY_BYTES = '1000'
    queryMock.mockResolvedValue({ rows: [{ body: 'x'.repeat(5000) }] })
    await createDbClient().from('artifacts').select('body').limit(1)
    expect(egressSnapshot().totalBytes).toBeGreaterThan(5000)
  })

  it('does not throw for writes (the bytes already moved — record, never break the write)', async () => {
    process.env.EGRESS_MAX_QUERY_BYTES = '10'
    queryMock.mockImplementation((sql: string) => {
      if (/information_schema/.test(sql)) return Promise.resolve({ rows: [] })
      return Promise.resolve({ rows: [{ id: 1, body: 'y'.repeat(500) }] })
    })
    const { error } = await createDbClient().from('company_memos').insert({ body: 'y'.repeat(500) })
    expect(error).toBeNull()
  })
})

describe('attribution', () => {
  it('attributes every query to the surrounding label', async () => {
    await withEgressLabel('GET /api/goals/[id]/status', async () => {
      await createDbClient().from('goals').select('status').eq('id', 'g1').single()
      await createDbClient().from('goal_tasks').select('status').eq('goal_id', 'g1')
    })
    await createDbClient().from('goals').select('id')
    const labels = egressSnapshot().byLabel.map((l) => l.label).sort()
    expect(labels).toEqual(['GET /api/goals/[id]/status', 'unlabeled'])
    expect(egressSnapshot().byLabel.find((l) => l.label === 'GET /api/goals/[id]/status')?.calls).toBe(2)
  })

  it('counts count-only queries as (near) free and does not meter introspection', async () => {
    queryMock.mockImplementation((sql: string) =>
      Promise.resolve(/COUNT\(\*\)/.test(sql) ? { rows: [{ count: '12' }] } : { rows: [] })
    )
    const { count } = await createDbClient().from('goals').select('id', { count: 'exact', head: true })
    expect(count).toBe(12)
    expect(egressSnapshot().totalBytes).toBe(0)
  })
})
