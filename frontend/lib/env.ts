// lib/env.ts
// Zod-based env validation (Phase 2.4, 10x rebuild).
//
// Scope note: this validates the server-side secrets that the worker/engine
// layer needs to run (DB, GCS, Firebase Admin, encryption, internal auth).
// It is deliberately NOT wired into every Next.js route or the root layout —
// this repo's .env.local is currently missing NEXT_PUBLIC_FIREBASE_* (a
// pre-existing, documented gap — see CROST_MASTER.md Phase 2.1 entry), and
// forcing a hard throw at request time across all routes would turn that
// known-but-tolerated gap into a wider outage than it is today. Call
// validateEnv() explicitly from a real process entrypoint (scripts/worker.ts)
// where "fail fast at boot" is unambiguously the right behavior.
//
// Server-side ONLY.

import { z } from 'zod'

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Cloud SQL connection string)'),
  GCS_BUCKET: z.string().min(1, 'GCS_BUCKET is required (artifact storage)'),
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required (Firebase Admin auth)'),
  FIREBASE_CLIENT_EMAIL: z.string().min(1, 'FIREBASE_CLIENT_EMAIL is required (Firebase Admin auth)'),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'FIREBASE_PRIVATE_KEY is required (Firebase Admin auth)'),
  USER_API_ENCRYPTION_KEY: z.string().min(1, 'USER_API_ENCRYPTION_KEY is required (per-user API key encryption)'),
  // Both optional individually — enforced together by refine() below, since
  // WORKER_INTERNAL_SECRET falls back to SUPABASE_SERVICE_ROLE_KEY (see
  // lib/auth/guard.ts). Must be declared here (not just read off process.env
  // inside refine) or zod strips them from the parsed output before refine
  // ever sees them.
  WORKER_INTERNAL_SECRET: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
})
  .refine((env) => Boolean(env.WORKER_INTERNAL_SECRET || env.SUPABASE_SERVICE_ROLE_KEY), {
    message: 'One of WORKER_INTERNAL_SECRET or SUPABASE_SERVICE_ROLE_KEY is required (trusted internal-caller auth)',
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
