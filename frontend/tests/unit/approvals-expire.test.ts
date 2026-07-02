/**
 * Unit tests: app/api/approvals/expire/route.ts (T7 — cron secret mandatory, finding #7).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const updateMock = vi.fn()
const insertMock = vi.fn(() => Promise.resolve({ error: null }))
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'event_log') return { insert: insertMock }
      const builder: any = {
        update: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        lt: vi.fn(() => builder),
        select: vi.fn(() => updateMock()),
      }
      return builder
    }),
  })),
}))

import { POST } from '@/app/api/approvals/expire/route'

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/approvals/expire', { method: 'POST', headers })
}

describe('POST /api/approvals/expire', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    updateMock.mockReset()
    insertMock.mockClear()
  })
  afterEach(() => {
    process.env.CRON_SECRET = originalSecret
  })

  it('HARD-FAILS with 500 when CRON_SECRET is unset, regardless of header (finding #7)', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(makeReq({ 'x-cron-secret': 'anything' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/CRON_SECRET is not configured/)
  })

  it('returns 401 when the provided secret does not match', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const res = await POST(makeReq({ 'x-cron-secret': 'wrong' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when no secret header is provided at all', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    const res = await POST(makeReq())
    expect(res.status).toBe(401)
  })

  it('succeeds and expires overdue rows when the secret matches', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    updateMock.mockReturnValue(
      Promise.resolve({ data: [{ id: 'a1', department_name: 'Sales', action_label: 'Send email' }], error: null }),
    )
    const res = await POST(makeReq({ 'x-cron-secret': 'correct-secret' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.expired).toBe(1)
    expect(body.expiredIds).toEqual(['a1'])
    expect(insertMock).toHaveBeenCalled()
  })

  it('returns expired: 0 and skips event_log insert when nothing is overdue', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    updateMock.mockReturnValue(Promise.resolve({ data: [], error: null }))
    const res = await POST(makeReq({ 'x-cron-secret': 'correct-secret' }))
    const body = await res.json()
    expect(body.expired).toBe(0)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('returns 500 when the update query errors', async () => {
    process.env.CRON_SECRET = 'correct-secret'
    updateMock.mockReturnValue(Promise.resolve({ data: null, error: { message: 'db error' } }))
    const res = await POST(makeReq({ 'x-cron-secret': 'correct-secret' }))
    expect(res.status).toBe(500)
  })
})
