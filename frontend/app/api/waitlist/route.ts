// /api/waitlist — marketing-site waitlist.
//   POST { email, source? } → adds the email (idempotent). Public, rate-limited per IP.
//   GET → { count } (the table itself is not readable by the public API).
//
// Public by design (no session): the only write is an email address into an
// insert-only table, plus an optional server-side Brevo contact add.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { runInBackground } from '@/lib/background'

export const dynamic = 'force-dynamic'

const TERMS_VERSION = '2026-10-01'

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  source: z.string().trim().max(64).optional(),
})

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
}

async function addToBrevo(email: string) {
  const apiKey = process.env.BREVO_API_KEY
  const listId = Number(process.env.BREVO_LIST_ID)
  if (!apiKey || !listId) return
  await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ email, listIds: [listId], updateEnabled: true }),
    signal: AbortSignal.timeout(8_000),
  })
}

export async function POST(req: NextRequest) {
  const { allowed, retryAfterSeconds } = checkRateLimit(`waitlist:${clientIp(req)}`, 5, 60_000)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
  }

  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  const { email, source } = parsed.data

  try {
    const supabase = createServerSupabaseClient()
    const { data: existing } = await supabase.from('waitlist').select('id').eq('email', email).maybeSingle()
    if (existing) return NextResponse.json({ success: true, alreadyJoined: true })

    const { error } = await supabase
      .from('waitlist')
      .insert({ email, source: source ?? 'landing_page', terms_version: TERMS_VERSION })
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return NextResponse.json({ success: true, alreadyJoined: true })
      throw error
    }

    runInBackground(addToBrevo(email))
    return NextResponse.json({ success: true, alreadyJoined: false })
  } catch (err) {
    console.error('[POST /api/waitlist]', err)
    return NextResponse.json({ error: 'Could not join the waitlist' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { count } = await supabase.from('waitlist').select('*', { count: 'exact', head: true })
    return NextResponse.json({ count: count ?? 0 }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
  } catch (err) {
    console.error('[GET /api/waitlist]', err)
    return NextResponse.json({ count: 0 })
  }
}
