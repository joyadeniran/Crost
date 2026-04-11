// lib/crypto.ts
// AES-256-GCM encryption for user API keys at rest.
// Server-side only — never import from a client component.
//
// Storage format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
// Key source: USER_API_ENCRYPTION_KEY env var (64-char hex = 32 bytes)

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // 96-bit IV recommended for GCM
const TAG_LENGTH = 16  // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env.USER_API_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('USER_API_ENCRYPTION_KEY is not set')
  }
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) {
    throw new Error('USER_API_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }
  return key
}

export function encryptApiKey(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptApiKey(stored: string): string {
  const key = getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key format')
  }

  const [ivHex, tagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
