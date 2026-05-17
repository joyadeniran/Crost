// lib/orc-learning.ts
// ORC self-improvement loop — Week 6 of ORC_ORCHESTRATION_UPGRADE_PLAN.md.
//
// Three concerns:
//   1. writeOutcomeToDecisionLog  — close the feedback loop when a goal resolves
//   2. computeLearningInsights    — aggregate log into mode/tier success rates
//   3. adjustRecencyScores        — nudge orc_context scores based on outcomes

import { createServerSupabaseClient } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GoalOutcome = 'successful' | 'partial' | 'failed'

export interface ModeStats {
  total: number
  successful: number
  failed: number
  successRate: number
}

export interface LearningInsights {
  userId: string
  periodDays: number
  totalDecisions: number
  resolvedDecisions: number
  overallSuccessRate: number
  byMode: Record<string, ModeStats>
  byRiskTier: Record<number, ModeStats>
  adjustmentsMade: number
}

// ─── writeOutcomeToDecisionLog ────────────────────────────────────────────────

/**
 * Writes the final outcome of a goal back to orc_decision_log.
 * Call this whenever a goal reaches a terminal status.
 * Fire-and-forget safe — never throws.
 */
export async function writeOutcomeToDecisionLog(
  goalId: string,
  outcome: GoalOutcome,
  outcomeDescription?: string,
): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    await supabase
      .from('orc_decision_log')
      .update({
        outcome,
        outcome_description: outcomeDescription ?? null,
        outcome_at: new Date().toISOString(),
      })
      .eq('goal_id', goalId)
      .is('outcome', null)
  } catch {
    // Non-fatal — learning loop is best-effort
  }
}

// ─── computeLearningInsights ──────────────────────────────────────────────────

/**
 * Aggregates the last `lookbackDays` of resolved decisions for a user.
 * Returns success rates by mode and risk tier.
 */
export async function computeLearningInsights(
  userId: string,
  lookbackDays = 7,
): Promise<LearningInsights> {
  const empty: LearningInsights = {
    userId, periodDays: lookbackDays,
    totalDecisions: 0, resolvedDecisions: 0,
    overallSuccessRate: 0, byMode: {}, byRiskTier: {}, adjustmentsMade: 0,
  }

  try {
    const supabase = createServerSupabaseClient()
    const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()

    const { data: rows, error } = await supabase
      .from('orc_decision_log')
      .select('orc_choice, confidence, risk_tier, outcome, assumptions, risk_notes')
      .eq('user_id', userId)
      .gte('created_at', since)

    if (error || !rows || rows.length === 0) return empty

    const total = rows.length
    const resolved = rows.filter(r => r.outcome != null)

    const byMode: Record<string, ModeStats> = {}
    const byTier: Record<number, ModeStats> = {}

    for (const row of resolved) {
      const mode = row.orc_choice ?? 'unknown'
      const tier = row.risk_tier ?? 1
      const isSuccess = row.outcome === 'successful'
      const isFailed = row.outcome === 'failed'

      if (!byMode[mode]) byMode[mode] = { total: 0, successful: 0, failed: 0, successRate: 0 }
      byMode[mode].total++
      if (isSuccess) byMode[mode].successful++
      if (isFailed) byMode[mode].failed++

      if (!byTier[tier]) byTier[tier] = { total: 0, successful: 0, failed: 0, successRate: 0 }
      byTier[tier].total++
      if (isSuccess) byTier[tier].successful++
      if (isFailed) byTier[tier].failed++
    }

    for (const s of Object.values(byMode)) s.successRate = s.total > 0 ? s.successful / s.total : 0
    for (const s of Object.values(byTier)) s.successRate = s.total > 0 ? s.successful / s.total : 0

    const overallSuccess = resolved.length > 0
      ? resolved.filter(r => r.outcome === 'successful').length / resolved.length
      : 0

    return {
      userId, periodDays: lookbackDays,
      totalDecisions: total,
      resolvedDecisions: resolved.length,
      overallSuccessRate: overallSuccess,
      byMode,
      byRiskTier: byTier,
      adjustmentsMade: 0,
    }
  } catch {
    return empty
  }
}

// ─── adjustRecencyScores ──────────────────────────────────────────────────────

/**
 * Nudges orc_context recency scores based on recent outcome data.
 *
 * Signal rules (applied to preference + strategy rows):
 *   - successful goal, tier 1 (no real risk) → +3 to assumption-matched rows
 *   - failed goal, tier 1 (no risk flagged, we were wrong) → -5 to assumption-matched rows
 *   - failed goal, tier 2/3 (risks were flagged correctly) → no change to assumptions;
 *     +2 to constraint rows (they were right)
 *
 * Scores are clamped to [10, 100].
 * Returns the number of orc_context rows updated.
 */
export async function adjustRecencyScores(userId: string, lookbackDays = 7): Promise<number> {
  try {
    const supabase = createServerSupabaseClient()
    const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()

    const { data: resolvedRows } = await supabase
      .from('orc_decision_log')
      .select('outcome, risk_tier, risk_notes, assumptions')
      .eq('user_id', userId)
      .gte('outcome_at', since)
      .not('outcome', 'is', null)

    if (!resolvedRows || resolvedRows.length === 0) return 0

    // Load all orc_context rows for this user
    const { data: contextRows } = await supabase
      .from('orc_context')
      .select('id, context_type, summary, recency_score')
      .eq('user_id', userId)

    if (!contextRows || contextRows.length === 0) return 0

    // Accumulate score deltas per context id
    const deltas: Record<string, number> = {}

    for (const log of resolvedRows) {
      const assumptionList: string[] = log.assumptions?.list ?? []
      const riskNotes: string[] = log.risk_notes ?? []
      const tier = log.risk_tier ?? 1

      if (log.outcome === 'successful' && tier === 1) {
        // Preferences/strategy that contributed to a clean success → small boost
        for (const assumption of assumptionList) {
          const matched = contextRows.filter(
            c => (c.context_type === 'preference' || c.context_type === 'strategy')
              && c.summary && assumption.includes(c.summary.slice(0, 40)),
          )
          for (const ctx of matched) deltas[ctx.id] = (deltas[ctx.id] ?? 0) + 3
        }
      }

      if (log.outcome === 'failed' && tier === 1 && riskNotes.length === 0) {
        // Tier 1 fail with no flagged risk — the applied preferences were misleading
        for (const assumption of assumptionList) {
          const matched = contextRows.filter(
            c => c.context_type === 'preference'
              && c.summary && assumption.includes(c.summary.slice(0, 40)),
          )
          for (const ctx of matched) deltas[ctx.id] = (deltas[ctx.id] ?? 0) - 5
        }
      }

      if (log.outcome === 'failed' && tier >= 2 && riskNotes.length > 0) {
        // Constraints that correctly flagged the risk → small boost
        const matched = contextRows.filter(c => c.context_type === 'constraint')
        for (const ctx of matched) {
          const wasRelevant = riskNotes.some(n =>
            ctx.summary && n.toLowerCase().includes(ctx.summary.toLowerCase().slice(0, 30)),
          )
          if (wasRelevant) deltas[ctx.id] = (deltas[ctx.id] ?? 0) + 2
        }
      }
    }

    // Apply clamped deltas
    let updatedCount = 0
    for (const [ctxId, delta] of Object.entries(deltas)) {
      if (delta === 0) continue
      const current = contextRows.find(c => c.id === ctxId)?.recency_score ?? 50
      const next = Math.min(100, Math.max(10, current + delta))
      if (next === current) continue

      await supabase
        .from('orc_context')
        .update({ recency_score: next })
        .eq('id', ctxId)
        .eq('user_id', userId)

      updatedCount++
    }

    return updatedCount
  } catch {
    return 0
  }
}
