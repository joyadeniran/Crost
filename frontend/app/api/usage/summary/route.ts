import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { computeMonthlySpend } from '@/lib/cost-tracker'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

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
