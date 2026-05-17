// lib/recurring-missions.ts
// Recurring Missions — scheduled goals that re-fire on a cadence.
// Part of ORC_ORCHESTRATION_UPGRADE_PLAN.md Phase 3 (Week 5).

import { createServerSupabaseClient } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecurringCadence = 'daily' | 'weekly' | 'monthly'

export interface RecurringMission {
  id: string
  user_id: string
  title: string
  founder_input: string
  cadence: RecurringCadence
  cadence_day: number | null
  next_run_at: string
  last_run_at: string | null
  last_goal_id: string | null
  source_goal_id: string | null
  is_active: boolean
  auto_dispatch: boolean
  risk_tier_limit: 1 | 2 | 3
  run_count: number
  created_at: string
  updated_at: string
}

export interface CreateRecurringMissionInput {
  title: string
  founder_input: string
  cadence: RecurringCadence
  cadence_day?: number | null
  auto_dispatch?: boolean
  risk_tier_limit?: 1 | 2 | 3
  source_goal_id?: string | null
}

// ─── calculateNextRun ─────────────────────────────────────────────────────────

/**
 * Returns the next scheduled run date at 9:00 AM local time.
 *
 * - daily:   tomorrow at 9am
 * - weekly:  +7 days from fromDate at 9am
 * - monthly: same date next month at 9am (clamped to last day of month when
 *            cadence_day > days in that month)
 */
export function calculateNextRun(
  cadence: RecurringCadence,
  fromDate: Date = new Date(),
  cadenceDay?: number | null,
): Date {
  const next = new Date(fromDate)
  next.setHours(9, 0, 0, 0)

  if (cadence === 'daily') {
    next.setDate(next.getDate() + 1)
  } else if (cadence === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else {
    // monthly
    const targetDay = cadenceDay ?? next.getDate()
    next.setMonth(next.getMonth() + 1)
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(targetDay, daysInMonth))
  }

  return next
}

// ─── checkAutoDispatchEligibility ────────────────────────────────────────────

/**
 * Returns true when a mission's auto_dispatch setting and risk gate allow
 * fully automated task dispatch without founder review.
 */
export function checkAutoDispatchEligibility(
  mission: Pick<RecurringMission, 'auto_dispatch' | 'risk_tier_limit'>,
  orcDecision: { mode: string; risk_notes: string[]; risk_tier?: number },
): boolean {
  if (!mission.auto_dispatch) return false

  const AUTO_ELIGIBLE_MODES = ['quick_plan', 'direct_action']
  if (!AUTO_ELIGIBLE_MODES.includes(orcDecision.mode)) return false

  if (orcDecision.risk_notes.length > 0) return false

  const riskTier = orcDecision.risk_tier ?? 1
  if (riskTier > mission.risk_tier_limit) return false

  return true
}

// ─── createRecurringMission ───────────────────────────────────────────────────

export async function createRecurringMission(
  userId: string,
  input: CreateRecurringMissionInput,
): Promise<RecurringMission> {
  const supabase = createServerSupabaseClient()

  const nextRunAt = calculateNextRun(input.cadence, new Date(), input.cadence_day)

  const { data, error } = await supabase
    .from('recurring_missions')
    .insert({
      user_id: userId,
      title: input.title,
      founder_input: input.founder_input,
      cadence: input.cadence,
      cadence_day: input.cadence_day ?? null,
      next_run_at: nextRunAt.toISOString(),
      is_active: true,
      auto_dispatch: input.auto_dispatch ?? false,
      risk_tier_limit: input.risk_tier_limit ?? 1,
      source_goal_id: input.source_goal_id ?? null,
    })
    .select('*')
    .single()

  if (error) throw new Error(`createRecurringMission: ${error.message}`)
  return data as RecurringMission
}

// ─── listRecurringMissions ────────────────────────────────────────────────────

export async function listRecurringMissions(userId: string): Promise<RecurringMission[]> {
  const supabase = createServerSupabaseClient()

  const { data, error } = await supabase
    .from('recurring_missions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(`listRecurringMissions: ${error.message}`)
  return (data ?? []) as RecurringMission[]
}
