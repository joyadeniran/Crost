// lib/auth/guard.ts
// Central auth guard — replaces the copy-pasted session/internal-secret checks
// duplicated across app/api/**/route.ts files (Phase 2.3, 10x rebuild).
//
// Behavior is a verbatim extraction of the pattern in
// app/api/worker/execute/route.ts (the canonical dual-mode reference) and the
// session-only checks used elsewhere. Do NOT change response shapes/status
// codes here without a characterization test proving the old shape first —
// every call site's T7 test asserts exact status codes.
//
// Server-side ONLY.

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerComponentClient } from '@/lib/supabase'

const INTERNAL_SECRET = process.env.WORKER_INTERNAL_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY

export type GuardOk = { ok: true; userId: string; via: 'session' | 'internal' }
export type GuardFail = { ok: false; response: NextResponse }
export type GuardResult = GuardOk | GuardFail

/**
 * Session-only auth. Mirrors the pattern used by the majority of routes:
 *   const authClient = await createSupabaseServerComponentClient()
 *   const { data: { user } } = await authClient.auth.getUser()
 *   if (!user) return 401
 */
export async function requireUser(_req: NextRequest): Promise<GuardResult> {
  const authClient = await createSupabaseServerComponentClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthenticated' }, { status: 401 }) }
  }
  return { ok: true, userId: user.id, via: 'session' }
}

/**
 * Checks the trusted internal header only. Returns null (not a GuardResult)
 * when the header is absent/invalid so callers can fall through to session
 * auth — this mirrors the if/else branch in worker/execute/route.ts, not an
 * independent pass/fail gate.
 */
export function checkInternalSecret(req: NextRequest): boolean {
  const internalSecret = req.headers.get('x-crost-internal-secret')
  return Boolean(internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET)
}

/**
 * Dual-mode gate used by worker/internal-triggered routes: a trusted internal
 * caller (x-crost-internal-secret header) may pass a userId explicitly
 * (bodyUserId) since there's no session to derive it from; everyone else must
 * have a valid session. Ownership/ownership-scoping against resource rows is
 * still the caller's responsibility after this returns ok.
 */
export async function requireUserOrInternal(
  req: NextRequest,
  opts: { bodyUserId?: string | null } = {}
): Promise<GuardResult> {
  if (checkInternalSecret(req)) {
    return { ok: true, userId: opts.bodyUserId ?? '', via: 'internal' }
  }
  return requireUser(req)
}
