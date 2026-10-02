/**
 * Chat routes: POST /api/chat (auth, ownership, budget, stream + trailer, persistence) and
 * POST /api/chats/[id]/run (ownership, atomic claim → at most one mission per plan).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const guard = vi.fn()
vi.mock('@/lib/auth/guard', () => ({ requireUser: (...a: unknown[]) => guard(...a) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) }))
const budget = vi.fn(async () => ({ allowed: true }))
vi.mock('@/lib/engine/budget', () => ({ checkTokenBudget: () => budget() }))
vi.mock('@/lib/usage-logger', () => ({ logUsage: vi.fn(async () => {}) }))

const store = {
  getOwnedChat: vi.fn(),
  createChat: vi.fn(async () => ({ id: '11111111-1111-4111-8111-111111111111', title: 't' })),
  loadHistory: vi.fn(async () => []),
  loadCompanyContext: vi.fn(async () => ({ companyName: 'Acme' })),
  addMessage: vi.fn(async () => ({ id: 'msg-assistant', created_at: '' })),
  HISTORY_TURNS: 20,
  MAX_MESSAGES_RETURNED: 200,
}
vi.mock('@/lib/chat/store', () => store)

let streamChunks: string[] = []
let streamFails = false
vi.mock('@/lib/chat/orc', async (orig) => {
  const real = await orig<typeof import('@/lib/chat/orc')>()
  return {
    ...real,
    streamOrcReply: async function* () {
      if (streamFails) throw new Error('model down')
      for (const c of streamChunks) yield c
      return { model: 'gemini-test', tokens: 10 }
    },
  }
})

const query = vi.fn()
vi.mock('@/lib/db', () => ({ getPool: () => ({ query }) }))
const startMission = vi.fn(async () => 'goal-1')
vi.mock('@/lib/chat/mission', () => ({ startMission: (...a: unknown[]) => startMission(...a) }))

const { POST: chatPOST } = await import('@/app/api/chat/route')
const { POST: runPOST } = await import('@/app/api/chats/[id]/run/route')

const CHAT = '22222222-2222-4222-8222-222222222222'
const MSG = '33333333-3333-4333-8333-333333333333'
const req = (url: string, body: unknown) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })

async function readAll(res: Response) {
  const text = await res.text()
  const cut = text.indexOf('\u0000')
  return { reply: text.slice(0, cut), trailer: JSON.parse(text.slice(cut + 1)) }
}

beforeEach(() => {
  vi.clearAllMocks()
  guard.mockResolvedValue({ ok: true, userId: 'user-1', via: 'session' })
  budget.mockResolvedValue({ allowed: true })
  streamChunks = ['Hi ', 'there.']
  streamFails = false
})

describe('POST /api/chat', () => {
  it('rejects unauthenticated requests', async () => {
    guard.mockResolvedValueOnce({ ok: false, response: new Response(null, { status: 401 }) })
    const res = await chatPOST(req('http://x/api/chat', { message: 'hi' }))
    expect(res.status).toBe(401)
  })

  it('404s on a chat the user does not own', async () => {
    store.getOwnedChat.mockResolvedValueOnce(null)
    const res = await chatPOST(req('http://x/api/chat', { chat_id: CHAT, message: 'hi' }))
    expect(res.status).toBe(404)
    expect(store.addMessage).not.toHaveBeenCalled()
  })

  it('returns 429 when the daily budget is spent', async () => {
    budget.mockResolvedValueOnce({ allowed: false, tokensUsed: 1, limit: 1, resetAt: '' } as any)
    const res = await chatPOST(req('http://x/api/chat', { message: 'hi' }))
    expect(res.status).toBe(429)
  })

  it('creates a chat, streams the reply and saves both messages', async () => {
    const res = await chatPOST(req('http://x/api/chat', { message: 'What can you do?' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Chat-Id')).toBe('11111111-1111-4111-8111-111111111111')
    const { reply, trailer } = await readAll(res)
    expect(reply).toBe('Hi there.')
    expect(trailer).toMatchObject({ message_id: 'msg-assistant', plan: null })
    expect(store.addMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({ role: 'user', content: 'What can you do?', userId: 'user-1' }))
    expect(store.addMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({ role: 'assistant', content: 'Hi there.' }))
  })

  it('stores a proposed plan in the assistant message meta and strips it from the text', async () => {
    store.getOwnedChat.mockResolvedValueOnce({ id: CHAT })
    streamChunks = ['On it.', '<plan>{"title":"Deck","tasks":[{"dept":"marketing","label":"Outline"}]}</plan>']
    const { trailer } = await readAll(await chatPOST(req('http://x/api/chat', { chat_id: CHAT, message: 'make a deck' })))
    expect(trailer.plan.title).toBe('Deck')
    expect(store.addMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      role: 'assistant', content: 'On it.', meta: { plan: expect.objectContaining({ title: 'Deck' }) },
    }))
  })

  it('ends the stream with an error trailer (and saves no reply) when the model fails', async () => {
    streamFails = true
    const { trailer } = await readAll(await chatPOST(req('http://x/api/chat', { message: 'hi' })))
    expect(trailer.error).toMatch(/try again/i)
    expect(store.addMessage).toHaveBeenCalledTimes(1) // only the user's message
  })

  it('rejects an empty message', async () => {
    const res = await chatPOST(req('http://x/api/chat', { message: '   ' }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/chats/[id]/run', () => {
  const plan = { title: 'Deck', tasks: [{ dept: 'marketing', label: 'Outline', deliverable: '', depends_on: [] }] }

  it('404s when the chat is not the user\'s', async () => {
    store.getOwnedChat.mockResolvedValueOnce(null)
    const res = await runPOST(req(`http://x/api/chats/${CHAT}/run`, { message_id: MSG }), { params: { id: CHAT } })
    expect(res.status).toBe(404)
    expect(startMission).not.toHaveBeenCalled()
  })

  it('claims the plan, starts one mission and records the goal on the message', async () => {
    store.getOwnedChat.mockResolvedValueOnce({ id: CHAT })
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meta: { plan, starting: true } }] }) // claim
      .mockResolvedValueOnce({ rows: [{ content: 'make a deck' }] }) // founder input
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // record goal_id
    const res = await runPOST(req(`http://x/api/chats/${CHAT}/run`, { message_id: MSG }), { params: { id: CHAT } })
    const j = await res.json()
    expect(j.data.goal_id).toBe('goal-1')
    expect(startMission).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-1', founderInput: 'make a deck' }))
    expect(query.mock.calls[0][0]).toMatch(/NOT \(meta \? 'goal_id'\)/)
  })

  it('returns the existing mission instead of starting a second one', async () => {
    store.getOwnedChat.mockResolvedValueOnce({ id: CHAT })
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ meta: { plan, goal_id: 'goal-0' } }] })
    const j = await (await runPOST(req(`http://x/api/chats/${CHAT}/run`, { message_id: MSG }), { params: { id: CHAT } })).json()
    expect(j.data).toEqual({ goal_id: 'goal-0', already: true })
    expect(startMission).not.toHaveBeenCalled()
  })

  it('releases the claim when the mission fails to start', async () => {
    store.getOwnedChat.mockResolvedValueOnce({ id: CHAT })
    startMission.mockRejectedValueOnce(new Error('db'))
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ meta: { plan, starting: true } }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
    const res = await runPOST(req(`http://x/api/chats/${CHAT}/run`, { message_id: MSG }), { params: { id: CHAT } })
    expect(res.status).toBe(500)
    expect(query.mock.calls.at(-1)?.[0]).toMatch(/meta - 'starting'/)
  })
})
