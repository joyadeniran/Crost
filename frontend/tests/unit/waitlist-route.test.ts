/**
 * Unit tests: app/api/waitlist/route.ts — public, insert-only waitlist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let existing: any = null
let insertError: { message: string } | null = null
let count = 0
const inserted: any[] = []
const waitUntil = vi.fn()

vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => waitUntil(p) }))
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => {
      const qb: any = {}
      qb.select = vi.fn((_c?: string, opts?: any) => (opts?.head ? Promise.resolve({ count, error: null }) : qb))
      qb.eq = vi.fn(() => qb)
      qb.maybeSingle = vi.fn(async () => ({ data: existing, error: null }))
      qb.insert = vi.fn((row: any) => { inserted.push(row); return Promise.resolve({ error: insertError }) })
      return qb
    }),
  })),
}))

import { GET, POST } from '@/app/api/waitlist/route'

let ipCounter = 0
const post = (body: any, ip = `10.0.0.${++ipCounter}`) =>
  new NextRequest('http://localhost/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

beforeEach(() => {
  existing = null
  insertError = null
  count = 0
  inserted.length = 0
  waitUntil.mockReset()
  delete process.env.BREVO_API_KEY
})

describe('POST /api/waitlist', () => {
  it('rejects a missing/invalid email with 400', async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ email: 'not-an-email' }))).status).toBe(400)
    expect((await POST(post('not json'))).status).toBe(400)
  })

  it('adds a new email (normalised to lowercase) and records the terms version', async () => {
    const res = await POST(post({ email: '  Founder@Example.COM ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, alreadyJoined: false })
    expect(inserted[0]).toMatchObject({ email: 'founder@example.com', source: 'landing_page' })
    expect(inserted[0].terms_version).toBeTruthy()
  })

  it('is idempotent: an existing email returns alreadyJoined without inserting', async () => {
    existing = { id: 'w1' }
    const res = await POST(post({ email: 'a@b.com' }))
    expect(await res.json()).toEqual({ success: true, alreadyJoined: true })
    expect(inserted).toHaveLength(0)
  })

  it('treats a unique-violation race as already joined', async () => {
    insertError = { message: 'duplicate key value violates unique constraint' }
    const res = await POST(post({ email: 'a@b.com' }))
    expect((await res.json()).alreadyJoined).toBe(true)
  })

  it('returns 500 on an unexpected database error', async () => {
    insertError = { message: 'connection refused' }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await POST(post({ email: 'a@b.com' }))).status).toBe(500)
  })

  it('rate-limits a single IP to 5 signups per minute', async () => {
    const ip = '203.0.113.9'
    for (let i = 0; i < 5; i++) expect((await POST(post({ email: `u${i}@b.com` }, ip))).status).toBe(200)
    expect((await POST(post({ email: 'u6@b.com' }, ip))).status).toBe(429)
  })

  it('only talks to Brevo when BREVO_API_KEY is configured (server-side, in the background)', async () => {
    await POST(post({ email: 'a@b.com' }))
    await waitUntil.mock.calls[0][0]
    expect(global.fetch).not.toHaveBeenCalled()

    process.env.BREVO_API_KEY = 'key'
    process.env.BREVO_LIST_ID = '7'
    vi.mocked(global.fetch).mockResolvedValue(new Response('{}'))
    await POST(post({ email: 'c@d.com' }))
    await waitUntil.mock.calls[1][0]
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.brevo.com/v3/contacts')
    expect(JSON.parse(init.body as string)).toMatchObject({ email: 'c@d.com', listIds: [7] })
  })
})

describe('GET /api/waitlist', () => {
  it('returns only the count — never the emails', async () => {
    count = 42
    const res = await GET()
    expect(await res.json()).toEqual({ count: 42 })
  })
})
