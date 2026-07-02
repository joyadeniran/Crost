// lib/engine/budget.ts
// Per-user, per-day system token budget check. Extracted verbatim from
// lib/llm-client.ts during the Phase 2 god-module split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'

export async function checkTokenBudget(userId: string): Promise<
  | { allowed: true }
  | { allowed: false; tokensUsed: number; limit: number; resetAt: string }
> {
  try {
    const supabase = createServerSupabaseClient()
    const limit = Number(process.env.FREE_SYSTEM_DAILY_TOKENS ?? '50000')

    // First-goal exemption: if the user has never used a system key, allow unrestricted
    const { count: lifetimeCount } = await supabase
      .from('api_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('key_type', 'system')

    if ((lifetimeCount ?? 0) === 0) {
      return { allowed: true } // First goal — exempt from daily limit
    }

    // Per-user per-day system token usage (resets at local midnight)
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)

    const { data: usage } = await supabase
      .from('api_usage_logs')
      .select('total_tokens')
      .eq('user_id', userId)
      .eq('key_type', 'system')
      .gte('created_at', todayMidnight.toISOString())

    const tokensUsed = (usage ?? []).reduce((sum: number, row: any) => sum + (row.total_tokens ?? 0), 0)

    if (tokensUsed >= limit) {
      // Reset time: next midnight local
      const resetAt = new Date(todayMidnight)
      resetAt.setDate(resetAt.getDate() + 1)
      return { allowed: false, tokensUsed, limit, resetAt: resetAt.toISOString() }
    }

    return { allowed: true }
  } catch {
    return { allowed: true } // Fail open — never block on budget check errors
  }
}
