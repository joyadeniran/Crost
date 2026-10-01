import { describe, it, expect, vi, beforeEach } from 'vitest'

const waitUntil = vi.fn()
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => waitUntil(p) }))

import { runInBackground, triggerDispatch, getBaseUrl } from '@/lib/background'

beforeEach(() => {
  waitUntil.mockReset()
  vi.mocked(global.fetch).mockReset()
  vi.mocked(global.fetch).mockResolvedValue(new Response('{}'))
})

describe('runInBackground', () => {
  it('registers the work with waitUntil so it outlives the response', async () => {
    const work = Promise.resolve(1)
    runInBackground(work)
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  it('never rejects: a failing task is logged, not thrown', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    runInBackground(Promise.reject(new Error('boom')))
    await waitUntil.mock.calls[0][0]
    expect(spy).toHaveBeenCalled()
  })

  it('still runs when waitUntil is unavailable (local dev / tests)', async () => {
    waitUntil.mockImplementation(() => { throw new Error('no vercel context') })
    expect(() => runInBackground(Promise.resolve())).not.toThrow()
  })
})

describe('triggerDispatch', () => {
  it('POSTs the internal dispatch with the internal-secret header', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crosthq.com/'
    process.env.WORKER_INTERNAL_SECRET = 'internal'
    triggerDispatch('goal-1', 'CHAIN_REACTION')
    await waitUntil.mock.calls[0][0]
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://crosthq.com/api/goals/goal-1/dispatch')
    expect((init.headers as Record<string, string>)['x-crost-internal-secret']).toBe('internal')
    expect(JSON.parse(init.body as string)).toEqual({ task_id: 'CHAIN_REACTION' })
  })
})

describe('getBaseUrl', () => {
  it('prefers NEXT_PUBLIC_APP_URL, then VERCEL_URL, then localhost', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://crosthq.com/'
    expect(getBaseUrl()).toBe('https://crosthq.com')
    delete process.env.NEXT_PUBLIC_APP_URL
    process.env.VERCEL_URL = 'crost-abc.vercel.app'
    expect(getBaseUrl()).toBe('https://crost-abc.vercel.app')
    delete process.env.VERCEL_URL
    expect(getBaseUrl()).toBe('http://localhost:3000')
  })
})
