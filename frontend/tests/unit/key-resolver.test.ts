/**
 * Unit tests: lib/key-resolver.ts — resolveApiKey priority chain.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockKeyRow: any = null
let mockThrow = false

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(() => {
          if (mockThrow) throw new Error('db error')
          return Promise.resolve({ data: mockKeyRow })
        }),
      }
      return builder
    }),
  })),
}))

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn((stored: string) => `decrypted:${stored}`),
}))

import { resolveApiKey } from '@/lib/key-resolver'
import { decryptApiKey } from '@/lib/crypto'

beforeEach(() => {
  mockKeyRow = null
  mockThrow = false
  vi.mocked(decryptApiKey).mockClear()
})

describe('resolveApiKey', () => {
  it('always returns system key when isBootstrap is true, without querying the DB', async () => {
    const result = await resolveApiKey({ userId: 'user-1', provider: 'anthropic', isBootstrap: true })
    expect(result).toEqual({ apiKey: null, keyType: 'system' })
    expect(decryptApiKey).not.toHaveBeenCalled()
  })

  it('returns system key when userId is null/undefined', async () => {
    expect(await resolveApiKey({ userId: null, provider: 'gemini' })).toEqual({ apiKey: null, keyType: 'system' })
    expect(await resolveApiKey({ userId: undefined, provider: 'gemini' })).toEqual({ apiKey: null, keyType: 'system' })
  })

  it('returns the decrypted user key when a valid BYOK row exists', async () => {
    mockKeyRow = { encrypted_key: 'enc-blob' }
    const result = await resolveApiKey({ userId: 'user-1', provider: 'groq' })
    expect(result).toEqual({ apiKey: 'decrypted:enc-blob', keyType: 'user' })
  })

  it('falls back to system key when no BYOK row exists', async () => {
    mockKeyRow = null
    const result = await resolveApiKey({ userId: 'user-1', provider: 'groq' })
    expect(result).toEqual({ apiKey: null, keyType: 'system' })
  })

  it('falls back to system key when the DB query throws', async () => {
    mockThrow = true
    const result = await resolveApiKey({ userId: 'user-1', provider: 'groq' })
    expect(result).toEqual({ apiKey: null, keyType: 'system' })
  })

  it('never throws even when decryptApiKey throws (falls through to system key)', async () => {
    mockKeyRow = { encrypted_key: 'corrupt' }
    vi.mocked(decryptApiKey).mockImplementationOnce(() => {
      throw new Error('bad key format')
    })
    const result = await resolveApiKey({ userId: 'user-1', provider: 'groq' })
    expect(result).toEqual({ apiKey: null, keyType: 'system' })
  })
})
