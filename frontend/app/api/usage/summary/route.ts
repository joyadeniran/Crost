import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerComponentClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { computeMonthlySpend } from '@/lib/cost-tracker'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    // Optional ?month=YYYY-MM override — defaults to current month inside computeMonthlySpend
    const summary = await computeMonthlySpend(user.id)

    return NextResponse.json({ success: true, data: summary, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[GET /api/usage/summary]', err)
    return NextResponse.json({ success: false, error: 'Internal error', timestamp: new Date().toISOString() }, { status: 500 })
  }
}
