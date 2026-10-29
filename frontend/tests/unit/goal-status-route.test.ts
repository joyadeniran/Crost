/**
 * GET /api/goals/[id]/status — the chat mission card's poll. Owner-scoped; each step carries
 * started_at so the card can show how long a department has been working.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const guard = vi.fn()
vi.mock('@/lib/auth/guard', () => ({ requireUser: (...a: unknown[]) => guard(...a) }))
vi.mock('@/lib/egress-guard', () => ({ guardRead: vi.fn(async () => null) }))
vi.mock('@/lib/egress', () => ({
  withEgressLabel: (_l: string, fn: () => unknown) => fn(),
  recordEgress: vi.fn(),
  approxBytes: () => 0,
}))
const query = vi.fn()
vi.mock('@/lib/db', () => ({ getPool: () => ({ query }) }))

const GOAL = '11111111-1111-4111-8111-111111111111'
const req = () => new NextRequest(`http://localhost/api/goals/${GOAL}/status`)

beforeEach(() => {
  guard.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' })
  query.mockReset()
})

describe('GET /api/goals/[id]/status', () => {
  it('returns each step with started_at, scoped to the owner', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ status: 'executing', goal_updated: '2026-10-29T22:12:09Z', task_count: 1, task_updated: '2026-10-29T22:12:09Z' }] })
      .mockResolvedValueOnce({ rows: [{ task_id: 't1', label: 'Draft', dept_slug: 'marketing', status: 'running', started_at: '2026-10-29T22:12:09.865Z', question: null }] })
      .mockResolvedValueOnce({ rows: [{ approvals: 0, artifacts: 0 }] })
    const { GET } = await import('@/app/api/goals/[id]/status/route')
    const res = await GET(req(), { params: { id: GOAL } })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.tasks[0]).toMatchObject({ status: 'running', started_at: '2026-10-29T22:12:09.865Z' })
    expect(query.mock.calls[0][1]).toEqual([GOAL, 'user-1'])
    expect(query.mock.calls[1][0]).toMatch(/assigned_at AS started_at/)
  })

  it('404s a goal the caller does not own', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    const { GET } = await import('@/app/api/goals/[id]/status/route')
    const res = await GET(req(), { params: { id: GOAL } })
    expect(res.status).toBe(404)
  })
})
