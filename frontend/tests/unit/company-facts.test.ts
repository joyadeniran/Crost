/**
 * Company facts: parsing, staleness, prompt block, the figure guard, Orc's <facts> protocol,
 * the worker prompt/fact check, and the /api/facts routes (auth, ownership, founder-only writes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { cleanFact, validateFacts, isStale, formatFactsForPrompt, normaliseKey, type CompanyFact } from '@/lib/facts/facts'
import { checkFigures, extractFigures } from '@/lib/facts/guard'
import { extractBlocks, extractPlan, visibleText, buildOrcSystemPrompt } from '@/lib/chat/orc'

const guard = vi.fn()
vi.mock('@/lib/auth/guard', () => ({ requireUser: (...a: unknown[]) => guard(...a) }))
const query = vi.fn()
const client = { query: vi.fn(), release: vi.fn() }
vi.mock('@/lib/db', () => ({ getPool: () => ({ query, connect: async () => client }) }))
vi.mock('@/lib/supabase', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/background', () => ({ triggerDispatch: vi.fn() }))

const fact = (o: Partial<CompanyFact>): CompanyFact => ({
  id: 'f1', key: 'k', value: 'v', as_of: null, source: null, volatile: false, prohibited: false, updated_at: '', ...o,
})

describe('facts helpers', () => {
  it('normalises keys and refuses facts without a key or value', () => {
    expect(normaliseKey('Monthly Revenue (USD)')).toBe('monthly_revenue_usd')
    expect(cleanFact({ key: '', value: 'x' })).toBeNull()
    expect(cleanFact({ key: 'a', value: '  ' })).toBeNull()
    expect(cleanFact(null)).toBeNull()
  })

  it('keeps only a real ISO date and guesses volatility from the key unless told', () => {
    expect(cleanFact({ key: 'mrr', value: '1', as_of: 'last month' })?.as_of).toBeNull()
    expect(cleanFact({ key: 'mrr', value: '1', as_of: '2026-09-30' })?.as_of).toBe('2026-09-30')
    expect(cleanFact({ key: 'monthly_revenue', value: '1' })?.volatile).toBe(true)
    expect(cleanFact({ key: 'legal_name', value: 'Acme Ltd' })?.volatile).toBe(false)
    expect(cleanFact({ key: 'users', value: '1', volatile: false })?.volatile).toBe(false)
    expect(cleanFact({ key: 'old_price', value: '$9', prohibited: true })?.volatile).toBe(false)
  })

  it('parses a <facts> payload, de-duplicating by key and capping the count', () => {
    const json = JSON.stringify([
      { key: 'users', value: '100' }, { key: 'users', value: '120' }, { bad: true },
      ...Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, value: String(i) })),
    ])
    const out = validateFacts(json)
    expect(out.find((f) => f.key === 'users')?.value).toBe('120')
    expect(out.length).toBeLessThanOrEqual(10)
    expect(validateFacts('not json')).toEqual([])
  })

  it('treats an undated or six-month-old volatile figure as stale, and nothing else', () => {
    const now = new Date('2026-10-02')
    expect(isStale({ volatile: true, as_of: null }, now)).toBe(true)
    expect(isStale({ volatile: true, as_of: '2026-03-01' }, now)).toBe(true)
    expect(isStale({ volatile: true, as_of: '2026-08-01' }, now)).toBe(false)
    expect(isStale({ volatile: false, as_of: null }, now)).toBe(false)
  })

  it('formats facts and the do-not-claim list for prompts', () => {
    const block = formatFactsForPrompt([
      fact({ key: 'mrr_usd', value: '12,000', as_of: '2026-09-30', source: 'Stripe', volatile: true }),
      fact({ key: 'never_1', value: '$77K MRR', prohibited: true }),
    ], new Date('2026-10-02'))
    expect(block).toContain('- mrr_usd: 12,000 (as of 2026-09-30; source: Stripe)')
    expect(block).toContain('DO NOT CLAIM')
    expect(block).toContain('- $77K MRR')
    expect(formatFactsForPrompt([])).toBe('')
  })
})

describe('figure guard', () => {
  const facts = [
    fact({ key: 'mrr_usd', value: '$2.4m' }),
    fact({ key: 'users', value: '1,200', as_of: '2026-07-31' }),
    fact({ key: 'never', value: 'We once claimed 77,000 MRR', prohibited: true }),
  ]

  it('matches a figure restated in another unit', () => {
    expect(checkFigures('Revenue is 2,400,000 a month.', facts).unverified).toEqual([])
    expect(checkFigures('Revenue is $2.4 million.', facts).unverified).toEqual([])
  })

  it('flags figures that are not on file, once each', () => {
    const r = checkFigures('We have 5,000 users and 5,000 waitlist sign-ups, growing 40%.', facts)
    expect(r.unverified.map((u) => u.token)).toEqual(['5,000', '40%'])
  })

  it('flags a do-not-claim figure even though it is a number', () => {
    const r = checkFigures('Back then we had 77k MRR.', facts)
    expect(r.prohibited).toHaveLength(1)
    expect(r.prohibited[0].rule).toContain('77,000')
  })

  it('skips years and small counts, and does not read "12 months" as 12 million', () => {
    expect(checkFigures('Our 3 steps for 2026.', facts).unverified).toEqual([])
    expect(extractFigures('runway of 12 months')[0].value).toBe(12)
  })

  it('accepts a date that is a fact\'s as_of', () => {
    expect(checkFigures('Counted on 2026-07-31.', facts).unverified).toEqual([])
    expect(checkFigures('Counted on 2026-08-01.', facts).unverified.map((u) => u.token)).toEqual(['2026-08-01'])
  })
})

describe('Orc <facts> protocol', () => {
  const facts = '<facts>[{"key":"mrr_usd","value":"12,000","as_of":"2026-09-30"}]</facts>'
  const plan = '<plan>{"title":"T","tasks":[{"dept":"sales","label":"L","deliverable":"D","depends_on":[]}]}</plan>'

  it('splits the reply from proposed facts, and from a plan alongside them', () => {
    const a = extractBlocks(`Noted — that's a good month.\n${facts}`)
    expect(a.reply).toBe("Noted — that's a good month.")
    expect(a.facts).toEqual([{ key: 'mrr_usd', value: '12,000', as_of: '2026-09-30', source: null, volatile: true, prohibited: false }])
    expect(a.plan).toBeNull()

    const b = extractBlocks(`On it.\n${plan}\n${facts}`)
    expect(b.reply).toBe('On it.')
    expect(b.plan?.title).toBe('T')
    expect(b.facts).toHaveLength(1)
    expect(extractPlan(`On it.\n${facts}`).reply).toBe('On it.')
  })

  it('hides a partial <facts> tag while streaming', () => {
    expect(visibleText('Noted.\n<fac')).toBe('Noted.')
    expect(visibleText('Noted.\n<facts>[{"key"')).toBe('Noted.')
  })

  it('puts the facts in the prompt and tells Orc it only proposes, never saves', () => {
    const p = buildOrcSystemPrompt({ companyName: 'Acme', factsBlock: 'COMPANY FACTS (x):\n- users: 10' })
    expect(p).toContain('- users: 10')
    expect(p).toMatch(/<facts>/)
    expect(p).toMatch(/never say it is saved/)
    expect(p).toMatch(/Only what the founder actually said/)
  })
})

describe('worker prompt and fact check', async () => {
  const { buildWorkerTaskPrompt, summariseFactCheck } = await import('@/lib/engine/worker')
  const task = { id: 't', action: 'a', label: 'L', reasoning: 'r', expected_deliverable: 'd', params: {} } as any

  it('gives departments the facts and the placeholder rule only when facts exist', () => {
    expect(buildWorkerTaskPrompt(task)).not.toContain('COMPANY FACTS')
    const p = buildWorkerTaskPrompt(task, 'COMPANY FACTS (x):\n- users: 10')
    expect(p.indexOf('COMPANY FACTS')).toBeLessThan(p.indexOf('Execute the task below'))
    expect(p).toMatch(/\[placeholder\]/)
  })

  it('summarises the check stored on a deliverable', () => {
    const s = summariseFactCheck('{"summary":"We serve 300 schools and 1,200 users."}', [fact({ key: 'users', value: '1200' })])
    expect(s).toEqual({ checked: 2, facts_on_file: 1, unverified: ['300'], prohibited: [] })
  })
})

describe('/api/facts', async () => {
  const { GET, POST } = await import('@/app/api/facts/route')
  const { DELETE } = await import('@/app/api/facts/[id]/route')
  const CHAT = '22222222-2222-4222-8222-222222222222'
  const MSG = '33333333-3333-4333-8333-333333333333'
  const ID = '44444444-4444-4444-8444-444444444444'
  const post = (body: unknown) => new NextRequest('http://x/api/facts', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

  beforeEach(() => {
    vi.clearAllMocks()
    guard.mockResolvedValue({ ok: true, userId: 'user-1', via: 'session' })
    client.query.mockImplementation(async (sql: string) => (sql.startsWith('INSERT') ? { rows: [{ id: 'new', key: 'users', value: '10' }] } : { rows: [] }))
  })

  it('rejects unauthenticated requests', async () => {
    guard.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) })
    expect((await GET(new NextRequest('http://x/api/facts'))).status).toBe(401)
    expect((await POST(post({ facts: [{ key: 'a', value: 'b' }] }))).status).toBe(401)
    expect(client.query).not.toHaveBeenCalled()
  })

  it('lists only the caller\'s live facts', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'f1', key: 'users', value: '10' }] })
    const res = await GET(new NextRequest('http://x/api/facts'))
    expect((await res.json()).data.facts).toHaveLength(1)
    expect(query.mock.calls[0][0]).toMatch(/created_by = \$1 AND active/)
    expect(query.mock.calls[0][1]).toEqual(['user-1'])
  })

  it('saves a fact, retiring the live row with the same key, in one transaction', async () => {
    const res = await POST(post({ facts: [{ key: 'Users', value: '10' }] }))
    expect(res.status).toBe(200)
    const sqls = client.query.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0])
    expect(sqls).toEqual(['BEGIN', 'UPDATE', 'INSERT', 'COMMIT'])
    expect(client.query.mock.calls[1][1]).toEqual(['user-1', 'users'])
    expect(client.query.mock.calls[2][1]).toContain('settings')
    expect(client.release).toHaveBeenCalled()
  })

  it('refuses a malformed fact rather than saving part of the list', async () => {
    const res = await POST(post({ facts: [{ key: 'a', value: 'b' }, { key: '', value: 'x' }] }))
    expect(res.status).toBe(400)
    expect(client.query).not.toHaveBeenCalled()
  })

  it('saves from chat only when the proposal is in the caller\'s own message, then marks it saved', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] })
    const denied = await POST(post({ facts: [{ key: 'a', value: 'b' }], chat_id: CHAT, message_id: MSG }))
    expect(denied.status).toBe(404)
    expect(query.mock.calls[0][1]).toEqual([MSG, CHAT, 'user-1'])
    expect(client.query).not.toHaveBeenCalled()

    query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] }).mockResolvedValueOnce({ rowCount: 1, rows: [] })
    const ok = await POST(post({ facts: [{ key: 'a', value: 'b' }], chat_id: CHAT, message_id: MSG }))
    expect(ok.status).toBe(200)
    expect(client.query.mock.calls[2][1]).toContain('chat')
    expect(query.mock.calls[2][0]).toMatch(/facts_saved/)
    expect(query.mock.calls[2][1]).toEqual([MSG, 'user-1'])
  })

  it('rolls back when a write fails', async () => {
    client.query.mockImplementation(async (sql: string) => { if (sql.startsWith('INSERT')) throw new Error('boom'); return { rows: [] } })
    const res = await POST(post({ facts: [{ key: 'a', value: 'b' }] }))
    expect(res.status).toBe(500)
    expect(client.query.mock.calls.map((c) => c[0])).toContain('ROLLBACK')
  })

  it('removes only the caller\'s fact; anything else is a 404', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 })
    expect((await DELETE(new NextRequest(`http://x/api/facts/${ID}`, { method: 'DELETE' }), { params: { id: ID } })).status).toBe(404)
    expect(query.mock.calls[0][1]).toEqual([ID, 'user-1'])
    query.mockResolvedValueOnce({ rowCount: 1 })
    expect((await DELETE(new NextRequest(`http://x/api/facts/${ID}`, { method: 'DELETE' }), { params: { id: ID } })).status).toBe(200)
    expect((await DELETE(new NextRequest('http://x/api/facts/nope', { method: 'DELETE' }), { params: { id: 'nope' } })).status).toBe(404)
  })
})
