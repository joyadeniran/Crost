// GET /api/usage/today
// Returns per-user system token usage for today plus BYOK key status.
// Used by the settings page to display the real usage meter and reset time.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const limit = Number(process.env.FREE_SYSTEM_DAILY_TOKENS ?? '50000')

    // Midnight UTC = start of the current billing day
    const todayMidnightUTC = new Date()
    todayMidnightUTC.setUTCHours(0, 0, 0, 0)

    // Tomorrow midnight = reset time
    const resetAt = new Date(todayMidnightUTC)
    resetAt.setUTCDate(resetAt.getUTCDate() + 1)

    // Today's system token usage for this user
    const { data: usage } = await supabase
      .from('api_usage_logs')
      .select('total_tokens')
      .eq('user_id', user.id)
      .eq('key_type', 'system')
      .gte('created_at', todayMidnightUTC.toISOString())

    const tokensUsed = (usage ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0)

    // Check if user has any valid BYOK keys (any provider)
    const { data: keys } = await supabase
      .from('user_api_keys')
      .select('provider')
      .eq('created_by', user.id)
      .eq('is_valid', true)
      .limit(1)

    const hasUserKey = (keys ?? []).length > 0

    return NextResponse.json({
      tokensUsed,
      limit,
      resetAt: resetAt.toISOString(),
      hasUserKey,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
