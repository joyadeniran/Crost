/**
 * Unit tests: middleware.ts — Supabase session gate + onboarding routing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: any = null
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({ auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) } })),
}))

import { middleware } from '@/middleware'

const req = (path: string, init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`https://crosthq.com${path}`, init)
const location = (res: Response) => res.headers.get('location')
const user = (step?: string) => ({ id: 'u1', email: 'a@b.com', user_metadata: step ? { onboarding_step: step } : {} })

beforeEach(() => { mockUser = null })

describe('/app protection', () => {
  it('redirects an unauthenticated visitor to /login', async () => {
    const res = await middleware(req('/app'))
    expect(location(res)).toBe('https://crosthq.com/login')
  })

  it('also protects deep app routes and onboarding', async () => {
    expect(location(await middleware(req('/app/approvals')))).toBe('https://crosthq.com/login')
    expect(location(await middleware(req('/app/onboarding/identity')))).toBe('https://crosthq.com/login')
  })

  it('sends a signed-in user with no onboarding step to identity', async () => {
    mockUser = user()
    expect(location(await middleware(req('/app')))).toBe('https://crosthq.com/app/onboarding/identity')
  })

  it('sends a user mid-onboarding to their current step, not the dashboard', async () => {
    mockUser = user('orc')
    expect(location(await middleware(req('/app')))).toBe('https://crosthq.com/app/onboarding/orc')
    mockUser = user('activated')
    expect(location(await middleware(req('/app/approvals')))).toBe('https://crosthq.com/app/onboarding/activate')
  })

  it('does not let a user skip ahead of their onboarding step', async () => {
    mockUser = user('identity')
    expect(location(await middleware(req('/app/onboarding/activate')))).toBe('https://crosthq.com/app/onboarding/identity')
  })

  it('lets a user go back to an earlier onboarding step', async () => {
    mockUser = user('activated')
    const res = await middleware(req('/app/onboarding/identity'))
    expect(location(res)).toBeNull()
  })

  it('lets a completed user into the app', async () => {
    mockUser = user('complete')
    const res = await middleware(req('/app/approvals'))
    expect(location(res)).toBeNull()
  })

  it('bounces a completed user out of onboarding to /app', async () => {
    mockUser = user('complete')
    expect(location(await middleware(req('/app/onboarding/identity')))).toBe('https://crosthq.com/app')
  })
})

describe('login / signup', () => {
  it('sends a signed-in user from /login to where they belong', async () => {
    mockUser = user('complete')
    expect(location(await middleware(req('/login')))).toBe('https://crosthq.com/app')
    mockUser = user()
    expect(location(await middleware(req('/signup')))).toBe('https://crosthq.com/app/onboarding/identity')
  })

  it('lets an anonymous visitor see /login and /signup', async () => {
    expect(location(await middleware(req('/login')))).toBeNull()
    expect(location(await middleware(req('/signup')))).toBeNull()
  })
})

describe('API routes', () => {
  it('skips the session lookup for /api (routes do their own auth)', async () => {
    const res = await middleware(req('/api/goals'))
    expect(res.status).toBe(200)
    expect(location(res)).toBeNull()
  })

  it('blocks a cross-origin state-changing API request', async () => {
    const res = await middleware(req('/api/goals', { method: 'POST', headers: { origin: 'https://evil.example.com' } }))
    expect(res.status).toBe(403)
  })

  it('allows a cross-origin POST that carries the internal secret', async () => {
    process.env.WORKER_INTERNAL_SECRET = 'internal'
    const res = await middleware(req('/api/goals/1/dispatch', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com', 'x-crost-internal-secret': 'internal' },
    }))
    expect(res.status).toBe(200)
  })
})
