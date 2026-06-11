/**
 * Unit tests: lib/google/oauth.ts + lib/google/auth.ts (offline refresh flow)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getOAuthConfig,
  buildAuthUrl,
  exchangeCode,
  refreshAccessToken,
  GOOGLE_OAUTH_SCOPES,
} from '@/lib/google/oauth'

beforeEach(() => {
  vi.mocked(fetch).mockReset()
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid.apps.googleusercontent.com'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csecret'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

describe('getOAuthConfig', () => {
  it('returns null when credentials are missing or placeholder', () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'REPLACE_ME'
    expect(getOAuthConfig()).toBeNull()
  })
  it('builds the redirect URI from NEXT_PUBLIC_APP_URL', () => {
    const cfg = getOAuthConfig()
    expect(cfg?.redirectUri).toBe('https://app.test/api/connect/google/callback')
  })
})

describe('buildAuthUrl', () => {
  it('requests offline access + consent with the right scopes', () => {
    const cfg = getOAuthConfig()!
    const url = new URL(buildAuthUrl(cfg, 'state123'))
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('state123')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe(GOOGLE_OAUTH_SCOPES.join(' '))
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/api/connect/google/callback')
  })
})

describe('exchangeCode', () => {
  it('exchanges an auth code for tokens', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, scope: 'a b' }),
    } as Response)
    const cfg = getOAuthConfig()!
    const tok = await exchangeCode(cfg, 'auth-code')
    expect(tok.access_token).toBe('at')
    expect(tok.refresh_token).toBe('rt')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(String((init as any).body)).toContain('grant_type=authorization_code')
  })
  it('throws on non-2xx', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad' } as Response)
    await expect(exchangeCode(getOAuthConfig()!, 'x')).rejects.toThrow(/token exchange failed \(400\)/)
  })
})

describe('refreshAccessToken', () => {
  it('mints a new access token from a refresh token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ access_token: 'at2', expires_in: 3600 }),
    } as Response)
    const tok = await refreshAccessToken(getOAuthConfig()!, 'rt')
    expect(tok.access_token).toBe('at2')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect(String((init as any).body)).toContain('grant_type=refresh_token')
  })
})

// ── getGoogleToken auto-refresh ──────────────────────────────────────────────

describe('getGoogleToken (auto-refresh)', () => {
  function dbReturning(row: any) {
    const b: any = {
      select: () => b, eq: () => b, upsert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: async () => ({ data: row, error: null }),
    }
    return { from: () => b, _b: b }
  }

  it('refreshes an expired access token using the stored refresh token', async () => {
    const { getGoogleToken } = await import('@/lib/google/auth')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ access_token: 'fresh', expires_in: 3600 }),
    } as Response)

    const db = dbReturning({
      access_token: 'stale',
      refresh_token: 'rt',
      token_expires_at: new Date(Date.now() - 3600_000).toISOString(),
    })
    const status = await getGoogleToken(db, 'user-1')
    expect(status.accessToken).toBe('fresh')
    expect(status.expired).toBe(false)
    expect(status.durable).toBe(true)
    expect(db._b.upsert).toHaveBeenCalled() // persisted the refreshed token
  })

  it('returns the cached token when still valid (no refresh call)', async () => {
    const { getGoogleToken } = await import('@/lib/google/auth')
    const db = dbReturning({
      access_token: 'good',
      refresh_token: 'rt',
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    })
    const status = await getGoogleToken(db, 'user-1')
    expect(status.accessToken).toBe('good')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports not-connected when nothing is stored', async () => {
    const { getGoogleToken } = await import('@/lib/google/auth')
    const db = dbReturning(null)
    const status = await getGoogleToken(db, 'user-1')
    expect(status.connected).toBe(false)
  })
})
