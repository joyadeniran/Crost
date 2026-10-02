// lib/env.ts
// Zod-based env validation (Phase 2.4, 10x rebuild).
//
// Scope note: this validates the server-side secrets the app needs to run
// (DB, Supabase auth/storage, Gemini, internal auth). It is surfaced at boot by
// instrumentation.ts as a loud log line — it deliberately does NOT throw at
// request time, so one missing optional secret can't take the whole site down.
//
// Server-side ONLY.

import { z } from 'zod'

// z.string().min(1, msg) only uses `msg` when the value is present-but-empty;
// a missing key hits zod's type check first and falls back to its generic
// "Required" message. required_error covers the missing-key case so the
// clear, actionable message always shows.
function requiredEnvVar(message: string) {
  return z.string({ required_error: message }).min(1, message)
}

const EnvSchema = z.object({
  DATABASE_URL: requiredEnvVar('DATABASE_URL is required (Supabase Postgres connection string — use the pooler URL on Vercel)'),
  NEXT_PUBLIC_SUPABASE_URL: requiredEnvVar('NEXT_PUBLIC_SUPABASE_URL is required (Supabase project URL)'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requiredEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY is required (Supabase anon key)'),
  SUPABASE_SERVICE_ROLE_KEY: requiredEnvVar('SUPABASE_SERVICE_ROLE_KEY is required (auth admin + storage)'),
  GEMINI_API_KEY: requiredEnvVar('GEMINI_API_KEY is required (Orc + department agents)'),
  CRON_SECRET: requiredEnvVar('CRON_SECRET is required (Vercel Cron + approval-expiry routes hard-fail without it)'),
  // Trusted internal-caller secret. Falls back to SUPABASE_SERVICE_ROLE_KEY
  // (see lib/auth/guard.ts); set a dedicated value to rotate independently.
  WORKER_INTERNAL_SECRET: z.string().optional(),
  // Only needed to connect Gmail (seals stored OAuth tokens); validated as 64 hex chars when present.
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
    .optional(),
})

export type ValidatedEnv = z.infer<typeof EnvSchema>

export type EnvValidationResult =
  | { ok: true; env: ValidatedEnv }
  | { ok: false; errors: string[] }

/**
 * Validates process.env against the required-server-secret schema. Does NOT
 * throw — callers decide whether a failure is fatal (see validateEnvOrExit
 * for the fail-fast entrypoint helper).
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const result = EnvSchema.safeParse(env)
  if (result.success) {
    return { ok: true, env: result.data }
  }
  const errors = result.error.issues.map((issue) => issue.message)
  return { ok: false, errors }
}

/**
 * Fail-fast entrypoint helper: logs every missing/invalid var with a clear
 * message and exits the process. Intended for scripts/worker.ts and similar
 * long-running server entrypoints — NOT for use inside a Next.js route
 * handler (would crash a single request instead of failing at boot).
 */
export function validateEnvOrExit(env: NodeJS.ProcessEnv = process.env): ValidatedEnv {
  const result = validateEnv(env)
  if (!result.ok) {
    console.error('[env] Missing/invalid required environment variables:')
    for (const err of result.errors) console.error(`  - ${err}`)
    process.exit(1)
  }
  return result.env
}
