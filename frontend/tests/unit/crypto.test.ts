/**
 * Unit tests: lib/crypto.ts
 *
 * AES-256-GCM encryption for user API keys at rest.
 * Covers: encrypt/decrypt roundtrip, tamper detection, missing/malformed key
 * env, malformed stored-value format.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const VALID_KEY_HEX = 'a'.repeat(64) // 32 bytes hex

describe('lib/crypto', () => {
  const originalEnv = process.env.USER_API_ENCRYPTION_KEY

  afterEach(() => {
    process.env.USER_API_ENCRYPTION_KEY = originalEnv
  })

  it('round-trips plaintext through encrypt/decrypt', async () => {
    process.env.USER_API_ENCRYPTION_KEY = VALID_KEY_HEX
    const { encryptApiKey, decryptApiKey } = await import('@/lib/crypto')
    const plaintext = 'sk-super-secret-api-key-12345'
    const encrypted = encryptApiKey(plaintext)
    expect(encrypted).not.toBe(plaintext)
    expect(decryptApiKey(encrypted)).toBe(plaintext)
  })

  it('stored format is iv:authTag:ciphertext (3 hex segments)', async () => {
    process.env.USER_API_ENCRYPTION_KEY = VALID_KEY_HEX
    const { encryptApiKey } = await import('@/lib/crypto')
    const encrypted = encryptApiKey('hello')
    const parts = encrypted.split(':')
    expect(parts).toHaveLength(3)
    parts.forEach((p) => expect(/^[0-9a-f]+$/.test(p)).toBe(true))
  })

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    process.env.USER_API_ENCRYPTION_KEY = VALID_KEY_HEX
    const { encryptApiKey } = await import('@/lib/crypto')
    const a = encryptApiKey('same-plaintext')
    const b = encryptApiKey('same-plaintext')
    expect(a).not.toBe(b)
  })

  it('throws on tampered ciphertext (auth tag mismatch)', async () => {
    process.env.USER_API_ENCRYPTION_KEY = VALID_KEY_HEX
    const { encryptApiKey, decryptApiKey } = await import('@/lib/crypto')
    const encrypted = encryptApiKey('data-to-protect')
    const [iv, tag, ciphertext] = encrypted.split(':')
    // Flip a hex character in the ciphertext
    const tamperedChar = ciphertext[0] === 'a' ? 'b' : 'a'
    const tampered = `${iv}:${tag}:${tamperedChar}${ciphertext.slice(1)}`
    expect(() => decryptApiKey(tampered)).toThrow()
  })

  it('throws on malformed stored value (wrong number of segments)', async () => {
    process.env.USER_API_ENCRYPTION_KEY = VALID_KEY_HEX
    const { decryptApiKey } = await import('@/lib/crypto')
    expect(() => decryptApiKey('only:two')).toThrow('Invalid encrypted key format')
    expect(() => decryptApiKey('not-even-colons')).toThrow('Invalid encrypted key format')
  })

  it('throws when USER_API_ENCRYPTION_KEY is not set', async () => {
    delete process.env.USER_API_ENCRYPTION_KEY
    const { encryptApiKey } = await import('@/lib/crypto')
    expect(() => encryptApiKey('x')).toThrow('USER_API_ENCRYPTION_KEY is not set')
  })

  it('throws when USER_API_ENCRYPTION_KEY is not 32 bytes', async () => {
    process.env.USER_API_ENCRYPTION_KEY = 'deadbeef' // too short
    const { encryptApiKey } = await import('@/lib/crypto')
    expect(() => encryptApiKey('x')).toThrow('USER_API_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  })
})
