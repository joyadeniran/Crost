/**
 * Unit tests: lib/engine/supervisor.ts — the stateless replacement for the
 * polling worker. Uses a tiny in-memory fake of the query-builder shim.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>
const tables: Record<string, Row[]> = {}
const dispatches: Array<[string, string]> = []
const reports: string[] = []

function fakeFrom(table: string) {
  const filters: Array<(r: Row) => boolean> = []
  let op: 'select' | 'update' | 'insert' = 'select'
  let patch: Row = {}
  let inserted: Row[] = []
  const qb: any = {}
  qb.select = () => qb
  qb.eq = (c: string, v: any) => { filters.push((r) => r[c] === v); return qb }
  qb.in = (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return qb }
  qb.lte = (c: string, v: any) => { filters.push((r) => r[c] != null && r[c] <= v); return qb }
  qb.update = (p: Row) => { op = 'update'; patch = p; return qb }
  qb.insert = (rows: Row | Row[]) => { op = 'insert'; inserted = Array.isArray(rows) ? rows : [rows]; return qb }
  const run = () => {
    const rows = (tables[table] ??= [])
    if (op === 'insert') { rows.push(...inserted); return { data: inserted, error: null } }
    const hit = rows.filter((r) => filters.every((f) => f(r)))
    if (op === 'update') { hit.forEach((r) => Object.assign(r, patch)); return { data: hit, error: null } }
    return { data: hit, error: null }
  }
  qb.maybeSingle = async () => ({ data: run().data![0] ?? null, error: null })
  qb.then = (resolve: any, reject: any) => Promise.resolve(run()).then(resolve, reject)
  return qb
}

vi.mock('@/lib/supabase', () => ({ createServerSupabaseClient: vi.fn(() => ({ from: fakeFrom })) }))
vi.mock('@/lib/background', () => ({ triggerDispatch: (g: string, t: string) => dispatches.push([g, t]) }))
vi.mock('@/lib/llm-client', () => ({ runOrcReport: vi.fn(async (id: string) => { reports.push(id) }) }))

import { runSupervisor, isDueForRetry } from '@/lib/engine/supervisor'

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  dispatches.length = 0
  reports.length = 0
  tables.goals = [{ id: 'g1', status: 'executing', created_by: 'user-1' }]
})

describe('isDueForRetry', () => {
  it('is due with no backoff, due once the time passes, not due before', () => {
    const now = Date.now()
    expect(isDueForRetry(null, now)).toBe(true)
    expect(isDueForRetry(undefined, now)).toBe(true)
    expect(isDueForRetry(new Date(now - 1000).toISOString(), now)).toBe(true)
    expect(isDueForRetry(new Date(now + 60_000).toISOString(), now)).toBe(false)
  })
})

describe('runSupervisor — reaper', () => {
  it('requeues a task stuck in running >10m with exponential backoff and bumps retry_count', async () => {
    tables.goal_tasks = [{ goal_id: 'g1', task_id: 't1', label: 'L', dept_slug: 'sales', status: 'running', retry_count: 1, assigned_at: minsAgo(11), orc_notes: [] }]
    const summary = await runSupervisor()
    expect(summary.reaped).toBe(1)
    const t = tables.goal_tasks[0]
    expect(t.status).toBe('pending')
    expect(t.retry_count).toBe(2)
    // backoff = 30s * 2^1 = 60s into the future
    const delta = new Date(t.next_retry_at).getTime() - Date.now()
    expect(delta).toBeGreaterThan(50_000)
    expect(delta).toBeLessThanOrEqual(61_000)
    expect(tables.event_log.some((e) => e.event_type === 'orc_task_requeued' && e.created_by === 'user-1')).toBe(true)
  })

  it('dead-letters to failed_permanent once retries are exhausted', async () => {
    tables.goal_tasks = [{ goal_id: 'g1', task_id: 't1', label: 'L', dept_slug: 'sales', status: 'running', retry_count: 3, assigned_at: minsAgo(30), orc_notes: [] }]
    const summary = await runSupervisor()
    expect(summary.deadLettered).toBe(1)
    expect(tables.goal_tasks[0].status).toBe('failed_permanent')
  })

  it('leaves a recently-started running task alone', async () => {
    tables.goal_tasks = [{ goal_id: 'g1', task_id: 't1', label: 'L', dept_slug: 'sales', status: 'running', retry_count: 0, assigned_at: minsAgo(1), orc_notes: [] }]
    const summary = await runSupervisor()
    expect(summary.reaped + summary.deadLettered + summary.stalled).toBe(0)
    expect(tables.goal_tasks[0].status).toBe('running')
  })
})

describe('runSupervisor — stall escalation', () => {
  it('raises ONE owner-scoped approval notice for a task running >5m, not on every pass', async () => {
    tables.goal_tasks = [{ goal_id: 'g1', task_id: 't1', label: 'Write plan', dept_slug: 'marketing', status: 'running', retry_count: 0, assigned_at: minsAgo(6), orc_notes: [] }]
    const first = await runSupervisor()
    expect(first.stalled).toBe(1)
    expect(tables.approval_queue).toHaveLength(1)
    expect(tables.approval_queue[0]).toMatchObject({ created_by: 'user-1', status: 'pending', goal_id: 'g1' })
    const second = await runSupervisor()
    expect(second.stalled).toBe(0)
    expect(tables.approval_queue).toHaveLength(1)
  })
})

describe('runSupervisor — dependency release & goal closure', () => {
  it('releases a dependent task once its dependency is completed AND its memo exists', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'a', status: 'completed', depends_on: [], assigned_at: null },
      { goal_id: 'g1', task_id: 'b', status: 'planned', depends_on: ['a'], next_retry_at: null },
    ]
    tables.company_memos = [{ goal_id: 'g1', task_id: 'a' }]
    const summary = await runSupervisor()
    expect(summary.released).toBe(1)
    expect(dispatches).toContainEqual(['g1', 'b'])
  })

  it('does NOT release when the dependency finished but its memo is missing', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'a', status: 'completed', depends_on: [] },
      { goal_id: 'g1', task_id: 'b', status: 'planned', depends_on: ['a'] },
    ]
    tables.company_memos = []
    const summary = await runSupervisor()
    expect(summary.released).toBe(0)
    expect(dispatches).toHaveLength(0)
  })

  it('does NOT release while the dependency is still running', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'a', status: 'running', depends_on: [], assigned_at: minsAgo(1) },
      { goal_id: 'g1', task_id: 'b', status: 'planned', depends_on: ['a'] },
    ]
    expect((await runSupervisor()).released).toBe(0)
  })

  it('does not release inside the retry-backoff window', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'a', status: 'completed', depends_on: [] },
      { goal_id: 'g1', task_id: 'b', status: 'pending', depends_on: ['a'], next_retry_at: new Date(Date.now() + 60_000).toISOString() },
    ]
    tables.company_memos = [{ goal_id: 'g1', task_id: 'a' }]
    expect((await runSupervisor()).released).toBe(0)
  })

  it('closes an executing goal with a Mission Report when every task is terminal', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'a', status: 'completed', depends_on: [] },
      { goal_id: 'g1', task_id: 'b', status: 'rejected', depends_on: [] },
    ]
    const summary = await runSupervisor()
    expect(summary.closedGoals).toBe(1)
    expect(reports).toEqual(['g1'])
    expect(tables.goals[0].status).toBe('completed')
  })

  it('does not close a goal that still has a non-terminal task', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'a', status: 'completed', depends_on: [] },
      { goal_id: 'g1', task_id: 'b', status: 'dispatched', depends_on: [] },
    ]
    expect((await runSupervisor()).closedGoals).toBe(0)
    expect(tables.goals[0].status).toBe('executing')
  })

  it('only supervises goals that are executing', async () => {
    tables.goals = [{ id: 'g1', status: 'planning', created_by: 'user-1' }]
    tables.goal_tasks = [{ goal_id: 'g1', task_id: 'a', status: 'completed', depends_on: [] }]
    expect((await runSupervisor()).closedGoals).toBe(0)
  })
})

describe('runSupervisor — pending dispatch', () => {
  it('dispatches due pending tasks with no dependencies, skips ones with deps or in backoff', async () => {
    tables.goal_tasks = [
      { goal_id: 'g1', task_id: 'free', status: 'pending', depends_on: [], next_retry_at: null },
      { goal_id: 'g1', task_id: 'blocked', status: 'pending', depends_on: ['free'] },
      { goal_id: 'g1', task_id: 'later', status: 'pending', depends_on: [], next_retry_at: new Date(Date.now() + 60_000).toISOString() },
    ]
    const summary = await runSupervisor()
    expect(summary.dispatchedPending).toBe(1)
    expect(dispatches).toContainEqual(['g1', 'free'])
    expect(dispatches.find(([, t]) => t === 'later')).toBeUndefined()
  })
})
