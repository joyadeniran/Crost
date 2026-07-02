/**
 * Unit tests: middleware.ts CSRF origin-check (Phase 4).
 * Tests the exported pure helpers directly rather than invoking the full
 * middleware() function, which needs a live Firebase JWKS fetch for the
 * non-API auth-redirect path — out of scope here (that logic predates this
 * phase and is unrelated to CSRF).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { isTrustedOrigin, checkInternalSecretHeader, middleware } from '@/middleware'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, NEXT_PUBLIC_APP_URL: 'https://crost-frontend-3ge3tx36sa-uc.a.run.app', WORKER_INTERNAL_SECRET: 'test-secret' }
})

describe('isTrustedOrigin', () => {
  it('allows a request with no Origin header (non-browser callers)', () => {
    expect(isTrustedOrigin('https://app.crosthq.com', null)).toBe(true)
  })

  it('allows an Origin that exactly matches the request self-origin', () => {
    expect(isTrustedOrigin('https://crost-frontend-3ge3tx36sa-uc.a.run.app', 'https://crost-frontend-3ge3tx36sa-uc.a.run.app')).toBe(true)
  })

  it('allows the canonical NEXT_PUBLIC_APP_URL even when self-origin differs (custom domain hit)', () => {
    expect(isTrustedOrigin('https://app.crosthq.com', 'https://crost-frontend-3ge3tx36sa-uc.a.run.app')).toBe(true)
  })

  it('allows the hardcoded app.crosthq.com domain', () => {
    expect(isTrustedOrigin('https://crost-frontend-3ge3tx36sa-uc.a.run.app', 'https://app.crosthq.com')).toBe(true)
  })

  it('rejects an origin not in the allowlist', () => {
    expect(isTrustedOrigin('https://app.crosthq.com', 'https://evil-attacker.example.com')).toBe(false)
  })

  it('ignores a trailing slash difference when comparing origins', () => {
    expect(isTrustedOrigin('https://app.crosthq.com/', 'https://app.crosthq.com')).toBe(true)
  })
})

describe('checkInternalSecretHeader', () => {
  it('returns true when the header matches WORKER_INTERNAL_SECRET', () => {
    expect(checkInternalSecretHeader('test-secret')).toBe(true)
  })

  it('returns false when the header is missing', () => {
    expect(checkInternalSecretHeader(null)).toBe(false)
  })

  it('returns false when the header does not match', () => {
    expect(checkInternalSecretHeader('wrong-secret')).toBe(false)
  })
})

// Full middleware() invocation for /api/* paths — these never reach the
// Firebase JWKS verification (short-circuited before it for API routes), so
// no network mocking is needed to exercise the real CSRF gate end-to-end.
describe('middleware() — CSRF gate on /api/* routes', () => {
  function apiRequest(opts: { method: string; origin?: string; internalSecret?: string }) {
    const headers: Record<string, string> = {}
    if (opts.origin) headers.origin = opts.origin
    if (opts.internalSecret) headers['x-crost-internal-secret'] = opts.internalSecret
    return new NextRequest('https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/goals', {
      method: opts.method,
      headers,
    })
  }

  it('lets GET requests through regardless of Origin', async () => {
    const res = await middleware(apiRequest({ method: 'GET', origin: 'https://evil-attacker.example.com' }))
    expect(res.status).toBe(200) // NextResponse.next() reports 200
  })

  it('blocks a cross-origin POST with a 403', async () => {
    const res = await middleware(apiRequest({ method: 'POST', origin: 'https://evil-attacker.example.com' }))
    expect(res.status).toBe(403)
  })

  it('allows a same-origin POST', async () => {
    const res = await middleware(apiRequest({ method: 'POST', origin: 'https://crost-frontend-3ge3tx36sa-uc.a.run.app' }))
    expect(res.status).toBe(200)
  })

  it('allows a cross-origin POST when a valid internal secret is present, even though Origin is untrusted', async () => {
    const res = await middleware(apiRequest({ method: 'POST', origin: 'https://evil-attacker.example.com', internalSecret: 'test-secret' }))
    expect(res.status).toBe(200)
  })

  it('allows a POST with no Origin header at all (server-to-server, no secret)', async () => {
    const res = await middleware(apiRequest({ method: 'POST' }))
    expect(res.status).toBe(200)
  })
})
