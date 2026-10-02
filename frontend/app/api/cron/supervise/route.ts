// GET|POST /api/cron/supervise — Orc supervision pass (Vercel Cron safety net).
// Auth: CRON_SECRET (Bearer or x-cron-secret). Hard-fails 500 if unset.

import { NextRequest, NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/auth/cron'
import { runSupervisor } from '@/lib/engine/supervisor'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handle(req: NextRequest) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  try {
    const summary = await runSupervisor()
    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('[cron/supervise]', err)
    return NextResponse.json({ error: 'Supervisor pass failed' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
