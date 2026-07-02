/**
 * Unit tests: lib/env.ts (Phase 2.4 — zod env validation).
 */
import { describe, it, expect } from 'vitest'
import { validateEnv } from '@/lib/env'

const VALID_ENV = {
  DATABASE_URL: 'postgres://user:pass@host/db',
  GCS_BUCKET: 'crost-artifacts',
  FIREBASE_PROJECT_ID: 'crost-prod',
  FIREBASE_CLIENT_EMAIL: 'sa@crost-prod.iam.gserviceaccount.com',
  FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  USER_API_ENCRYPTION_KEY: 'a'.repeat(32),
  WORKER_INTERNAL_SECRET: 'secret',
}

describe('validateEnv', () => {
  it('passes with all required vars and WORKER_INTERNAL_SECRET set', () => {
    const result = validateEnv(VALID_ENV as NodeJS.ProcessEnv)
    expect(result.ok).toBe(true)
  })

  it('passes when SUPABASE_SERVICE_ROLE_KEY substitutes for WORKER_INTERNAL_SECRET', () => {
    const { WORKER_INTERNAL_SECRET, ...rest } = VALID_ENV
    const result = validateEnv({ ...rest, SUPABASE_SERVICE_ROLE_KEY: 'fallback-secret' } as NodeJS.ProcessEnv)
    expect(result.ok).toBe(true)
  })

  it('fails when DATABASE_URL is missing', () => {
    const { DATABASE_URL, ...rest } = VALID_ENV
    const result = validateEnv(rest as NodeJS.ProcessEnv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('DATABASE_URL'))).toBe(true)
    }
  })

  it('fails when neither WORKER_INTERNAL_SECRET nor SUPABASE_SERVICE_ROLE_KEY is set', () => {
    const { WORKER_INTERNAL_SECRET, ...rest } = VALID_ENV
    const result = validateEnv(rest as NodeJS.ProcessEnv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes('WORKER_INTERNAL_SECRET'))).toBe(true)
    }
  })

  it('collects multiple errors at once rather than stopping at the first', () => {
    const result = validateEnv({} as NodeJS.ProcessEnv)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(1)
    }
  })
})
