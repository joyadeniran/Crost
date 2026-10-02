/**
 * Unit tests: lib/auth/cron.ts + cron routes — secret gate must HARD-FAIL when unset.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/engine/supervisor', () => ({
  runSupervisor: vi.fn(async () => ({ reaped: 1, deadLettered: 0, stalled: 0, released: 2, dispatchedPending: 0, closedGoals: 0 })),
}))
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => {
    const b: any = {}
    for (const m of ['update', 'eq', 'lt', 'insert']) b[m] = vi.fn(() => b)
    b.select = vi.fn(() => Promise.resolve({ data: [], error: null }))
    return { from: vi.fn(() => b) }
  }),
}))

import { requireCronSecret } from '@/lib/auth/cron'
import { GET as superviseGET, POST as supervisePOST } from '@/app/api/cron/supervise/route'
import { GET as expireGET, POST as expirePOST } from '@/app/api/approvals/expire/route'
import { GET as sugGET } from '@/app/api/suggested-actions/expire/route'

const req = (headers: Record<string, string> = {}) => new NextRequest('http://localhost/api/cron/x', { headers })

const original = process.env.CRON_SECRET
beforeEach(() => { process.env.CRON_SECRET = 'cron-secret' })
afterEach(() => { process.env.CRON_SECRET = original })

describe('requireCronSecret', () => {
  it('returns 500 (never skips auth) when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET
    const res = requireCronSecret(req({ authorization: 'Bearer anything' }))
    expect(res?.status).toBe(500)
  })

  it('returns 500 when CRON_SECRET is empty', () => {
    process.env.CRON_SECRET = ''
    expect(requireCronSecret(req())?.status).toBe(500)
  })

  it('returns 401 with no credentials', () => {
    expect(requireCronSecret(req())?.status).toBe(401)
  })

  it('returns 401 for a wrong bearer token and for a wrong x-cron-secret', () => {
    expect(requireCronSecret(req({ authorization: 'Bearer nope' }))?.status).toBe(401)
    expect(requireCronSecret(req({ 'x-cron-secret': 'nope' }))?.status).toBe(401)
  })

  it('accepts the Vercel Cron bearer header', () => {
    expect(requireCronSecret(req({ authorization: 'Bearer cron-secret' }))).toBeNull()
  })

  it('accepts the legacy x-cron-secret header', () => {
    expect(requireCronSecret(req({ 'x-cron-secret': 'cron-secret' }))).toBeNull()
  })

  it('does not accept an equal-length wrong secret', () => {
    expect(requireCronSecret(req({ authorization: 'Bearer cron-secreX' }))?.status).toBe(401)
  })
})

describe('cron routes are gated and reachable by Vercel Cron (GET)', () => {
  it('supervise: 500 unset / 401 unauthenticated / 200 authorised on both GET and POST', async () => {
    delete process.env.CRON_SECRET
    expect((await superviseGET(req())).status).toBe(500)
    process.env.CRON_SECRET = 'cron-secret'
    expect((await superviseGET(req())).status).toBe(401)
    const ok = await superviseGET(req({ authorization: 'Bearer cron-secret' }))
    expect(ok.status).toBe(200)
    expect((await ok.json()).released).toBe(2)
    expect((await supervisePOST(req({ 'x-cron-secret': 'cron-secret' }))).status).toBe(200)
  })

  it('approvals/expire: 500 unset, 401 wrong secret, 200 via GET bearer and POST header', async () => {
    delete process.env.CRON_SECRET
    expect((await expirePOST(req())).status).toBe(500)
    process.env.CRON_SECRET = 'cron-secret'
    expect((await expireGET(req({ 'x-cron-secret': 'bad' }))).status).toBe(401)
    expect((await expireGET(req({ authorization: 'Bearer cron-secret' }))).status).toBe(200)
    expect((await expirePOST(req({ 'x-cron-secret': 'cron-secret' }))).status).toBe(200)
  })

  it('suggested-actions/expire: GET without credentials is 401', async () => {
    expect((await sugGET(req())).status).toBe(401)
  })
})
