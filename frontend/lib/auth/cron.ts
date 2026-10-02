// lib/auth/cron.ts
// Cron-secret gate shared by every cron-style route.
//
// Hard-fails (500) when CRON_SECRET is unset — an unset secret must never turn
// into "auth skipped" (audit finding #7). Accepts either the
// `Authorization: Bearer <CRON_SECRET>` header that Vercel Cron sends, or the
// legacy `x-cron-secret` header used by manual/other callers.
//
// Server-side ONLY.

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/** Returns a NextResponse to short-circuit with, or null when the caller is authorised. */
export function requireCronSecret(req: NextRequest): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const bearer = req.headers.get('authorization')
  const provided = bearer?.startsWith('Bearer ') ? bearer.slice(7) : req.headers.get('x-cron-secret')
  if (!provided || !safeEqual(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
