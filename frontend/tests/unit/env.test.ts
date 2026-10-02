/**
 * Unit tests: lib/env.ts (zod env validation).
 */
import { describe, it, expect } from 'vitest'
import { validateEnv } from '@/lib/env'

const VALID_ENV = {
  DATABASE_URL: 'postgres://user:pass@host/db',
  NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'gemini',
  CRON_SECRET: 'cron',
}

describe('validateEnv', () => {
  it('passes with all required vars (WORKER_INTERNAL_SECRET optional)', () => {
    expect(validateEnv(VALID_ENV as NodeJS.ProcessEnv).ok).toBe(true)
  })

  it('passes with a dedicated WORKER_INTERNAL_SECRET', () => {
    expect(validateEnv({ ...VALID_ENV, WORKER_INTERNAL_SECRET: 'x' } as NodeJS.ProcessEnv).ok).toBe(true)
  })

  it.each(Object.keys(VALID_ENV))('fails when %s is missing', (key) => {
    const env = { ...VALID_ENV } as Record<string, string>
    delete env[key]
    const result = validateEnv(env as NodeJS.ProcessEnv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.some((e) => e.includes(key))).toBe(true)
  })

  it('collects multiple errors at once rather than stopping at the first', () => {
    const result = validateEnv({} as NodeJS.ProcessEnv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1)
  })
})
