/**
 * Unit tests: lib/auth/guard.ts (Phase 2.3 — central auth guard).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
}))

import { requireUser, requireUserOrInternal, checkInternalSecret } from '@/lib/auth/guard'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  mockUser = { id: 'user-1' }
  process.env = { ...ORIGINAL_ENV, WORKER_INTERNAL_SECRET: 'test-secret' }
})

function makeReq(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/anything', { headers })
}

describe('requireUser', () => {
  it('returns ok:true with the session userId when authenticated', async () => {
    const result = await requireUser(makeReq())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe('user-1')
      expect(result.via).toBe('session')
    }
  })

  it('returns a 401 response when unauthenticated', async () => {
    mockUser = null
    const result = await requireUser(makeReq())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
  })
})

describe('checkInternalSecret', () => {
  it('returns true when the header matches WORKER_INTERNAL_SECRET', () => {
    expect(checkInternalSecret(makeReq({ 'x-crost-internal-secret': 'test-secret' }))).toBe(true)
  })

  it('returns false when the header is missing', () => {
    expect(checkInternalSecret(makeReq())).toBe(false)
  })

  it('returns false when the header does not match', () => {
    expect(checkInternalSecret(makeReq({ 'x-crost-internal-secret': 'wrong' }))).toBe(false)
  })

  it('returns false when no secret is configured on either env var', () => {
    process.env.WORKER_INTERNAL_SECRET = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''
    expect(checkInternalSecret(makeReq({ 'x-crost-internal-secret': 'test-secret' }))).toBe(false)
  })
})

describe('requireUserOrInternal', () => {
  it('trusts the internal secret and uses bodyUserId without checking session', async () => {
    mockUser = null // session would fail, but internal secret should short-circuit
    const result = await requireUserOrInternal(makeReq({ 'x-crost-internal-secret': 'test-secret' }), {
      bodyUserId: 'body-user-1',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe('body-user-1')
      expect(result.via).toBe('internal')
    }
  })

  it('falls through to session auth when the secret is absent', async () => {
    const result = await requireUserOrInternal(makeReq())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.userId).toBe('user-1')
      expect(result.via).toBe('session')
    }
  })

  it('returns 401 when neither the secret nor a session is present', async () => {
    mockUser = null
    const result = await requireUserOrInternal(makeReq())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.response.status).toBe(401)
    }
  })
})
