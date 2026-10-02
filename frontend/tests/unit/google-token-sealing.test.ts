/**
 * Unit tests: lib/google/auth.ts — OAuth tokens are sealed at rest, never stored in plaintext.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/google/oauth', () => ({ getOAuthConfig: vi.fn(() => null), refreshAccessToken: vi.fn() }))
vi.mock('@/lib/../lib/google/oauth', () => ({ getOAuthConfig: vi.fn(() => null), refreshAccessToken: vi.fn() }))

import { storeGoogleToken, getGoogleToken, sealToken, openToken } from '@/lib/google/auth'

const KEY = 'a'.repeat(64)
let row: Record<string, any> | null
const db = {
  from: vi.fn(() => {
    const qb: any = {}
    qb.upsert = vi.fn(async (r: any) => { row = { ...(row ?? {}), ...r }; return { error: null } })
    qb.select = vi.fn(() => qb)
    qb.eq = vi.fn(() => qb)
    qb.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
    return qb
  }),
}

const original = { t: process.env.TOKEN_ENCRYPTION_KEY, u: process.env.USER_API_ENCRYPTION_KEY }
beforeEach(() => { row = null; process.env.TOKEN_ENCRYPTION_KEY = KEY; delete process.env.USER_API_ENCRYPTION_KEY })
afterEach(() => { process.env.TOKEN_ENCRYPTION_KEY = original.t; if (original.u) process.env.USER_API_ENCRYPTION_KEY = original.u })

describe('sealToken / openToken', () => {
  it('round-trips and produces a prefixed, non-plaintext value', () => {
    const sealed = sealToken('ya29.secret')
    expect(sealed.startsWith('enc:v1:')).toBe(true)
    expect(sealed).not.toContain('ya29.secret')
    expect(openToken(sealed)).toBe('ya29.secret')
  })

  it('uses a fresh IV each time (no deterministic ciphertext)', () => {
    expect(sealToken('same')).not.toBe(sealToken('same'))
  })

  it('reads legacy plaintext rows as-is and returns null for empty', () => {
    expect(openToken('plain-legacy')).toBe('plain-legacy')
    expect(openToken(null)).toBeNull()
    expect(openToken('')).toBeNull()
  })
})

describe('storeGoogleToken / getGoogleToken', () => {
  it('never writes the access or refresh token to the database in plaintext', async () => {
    await storeGoogleToken(db, 'user-1', { access_token: 'AT-plain', refresh_token: 'RT-plain', expires_in: 3600 })
    expect(row!.access_token).not.toContain('AT-plain')
    expect(row!.refresh_token).not.toContain('RT-plain')
    expect(row!.access_token.startsWith('enc:v1:')).toBe(true)
    expect(row!.created_by).toBe('user-1')
  })

  it('fails closed (throws, writes nothing) when the encryption key is missing', async () => {
    delete process.env.TOKEN_ENCRYPTION_KEY
    await expect(storeGoogleToken(db, 'user-1', { access_token: 'AT-plain' })).rejects.toThrow(/TOKEN_ENCRYPTION_KEY/)
    expect(row).toBeNull()
  })

  it('does not clobber a stored refresh token when a refresh grant omits it', async () => {
    await storeGoogleToken(db, 'user-1', { access_token: 'AT1', refresh_token: 'RT1' })
    const sealedRefresh = row!.refresh_token
    await storeGoogleToken(db, 'user-1', { access_token: 'AT2' })
    expect(row!.refresh_token).toBe(sealedRefresh)
  })

  it('returns the decrypted access token for a valid sealed row', async () => {
    await storeGoogleToken(db, 'user-1', { access_token: 'AT-plain', refresh_token: 'RT-plain', expires_in: 3600 })
    const status = await getGoogleToken(db, 'user-1')
    expect(status).toMatchObject({ accessToken: 'AT-plain', expired: false, connected: true, durable: true })
  })

  it('still works with a legacy plaintext row', async () => {
    row = { access_token: 'LEGACY', refresh_token: 'LEGACY-R', token_expires_at: new Date(Date.now() + 3_600_000).toISOString() }
    expect((await getGoogleToken(db, 'user-1')).accessToken).toBe('LEGACY')
  })

  it('treats an undecryptable value (rotated/wrong key) as "needs reconnect" without throwing', async () => {
    await storeGoogleToken(db, 'user-1', { access_token: 'AT', refresh_token: 'RT', expires_in: 3600 })
    process.env.TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const status = await getGoogleToken(db, 'user-1')
    expect(status).toMatchObject({ accessToken: null, expired: true, connected: true })
  })

  it('reports not connected when there is no row', async () => {
    expect(await getGoogleToken(db, 'user-1')).toMatchObject({ connected: false, accessToken: null })
  })
})
