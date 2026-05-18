// lib/cost-tracker.ts
// Real-time cost tracking and budget alert engine — Phase 4 Week 8.
//
// Three responsibilities:
//   1. computeMonthlySpend  — aggregate api_usage_logs for the current calendar month
//   2. getBudgetConstraint  — read the founder's monthly API budget from orc_context
//   3. classifyBudgetAlert  — return 'ok' | 'warning' | 'critical' | null

import { createServerSupabaseClient } from './supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BudgetAlertLevel = 'ok' | 'warning' | 'critical'

export interface ModelCostStats {
  calls: number
  tokens: number
  costUsd: number
}

export interface MonthlyCostSummary {
  userId: string
  month: string                                  // 'YYYY-MM'
  totalCostUsd: number
  totalTokens: number
  byModel: Record<string, ModelCostStats>
  byProvider: Record<string, ModelCostStats>
  budgetLimitUsd: number | null
  budgetUsedPct: number | null
  alertLevel: BudgetAlertLevel | null            // null when no budget set
}

// ─── getBudgetConstraint ──────────────────────────────────────────────────────

/**
 * Reads the user's monthly API budget from their orc_context constraint rows.
 * Looks for content.monthly_api_budget (number) first, then parses summaries
 * for patterns like "API budget: $500" or "monthly budget: $200".
 * Returns null when no constraint is configured.
 */
export async function getBudgetConstraint(userId: string): Promise<number | null> {
  try {
    const supabase = createServerSupabaseClient()
    const { data: rows } = await supabase
      .from('orc_context')
      .select('content, summary')
      .eq('user_id', userId)
      .eq('context_type', 'constraint')

    if (!rows || rows.length === 0) return null

    for (const row of rows) {
      // Check structured content first
      const budget = row.content?.monthly_api_budget
      if (typeof budget === 'number' && budget > 0) return budget

      // Parse summary text for "$N" patterns near budget keywords
      const summary = (row.summary ?? '').toLowerCase()
      if (summary.includes('budget') || summary.includes('api') || summary.includes('spend')) {
        const match = row.summary?.match(/\$(\d+(?:\.\d+)?)/)?.[1]
        if (match) return parseFloat(match)
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── classifyBudgetAlert ──────────────────────────────────────────────────────

/**
 * Returns the alert level based on spend vs limit.
 * warning  = 80–94 % used
 * critical = 95%+  used
 * ok       = below 80 %
 * null     = no budget configured
 */
export function classifyBudgetAlert(
  spentUsd: number,
  limitUsd: number | null,
): BudgetAlertLevel | null {
  if (limitUsd === null || limitUsd <= 0) return null
  const pct = spentUsd / limitUsd
  if (pct >= 0.95) return 'critical'
  if (pct >= 0.80) return 'warning'
  return 'ok'
}

// ─── computeMonthlySpend ──────────────────────────────────────────────────────

/**
 * Aggregates api_usage_logs for the current calendar month.
 * Fail-open: returns a zero-spend summary on any error.
 */
export async function computeMonthlySpend(userId: string): Promise<MonthlyCostSummary> {
  const now = new Date()
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const empty: MonthlyCostSummary = {
    userId, month,
    totalCostUsd: 0, totalTokens: 0,
    byModel: {}, byProvider: {},
    budgetLimitUsd: null, budgetUsedPct: null, alertLevel: null,
  }

  try {
    const supabase = createServerSupabaseClient()

    const [{ data: rows }, budgetLimit] = await Promise.all([
      supabase
        .from('api_usage_logs')
        .select('model, provider, total_tokens, cost_estimate')
        .eq('user_id', userId)
        .gte('created_at', monthStart),
      getBudgetConstraint(userId),
    ])

    if (!rows || rows.length === 0) {
      const alertLevel = classifyBudgetAlert(0, budgetLimit)
      return { ...empty, budgetLimitUsd: budgetLimit, budgetUsedPct: budgetLimit ? 0 : null, alertLevel }
    }

    const byModel: Record<string, ModelCostStats> = {}
    const byProvider: Record<string, ModelCostStats> = {}
    let totalCostUsd = 0
    let totalTokens = 0

    for (const row of rows) {
      const model = row.model ?? 'unknown'
      const provider = row.provider ?? 'unknown'
      const tokens = row.total_tokens ?? 0
      const cost = Number(row.cost_estimate ?? 0)

      totalCostUsd += cost
      totalTokens += tokens

      if (!byModel[model]) byModel[model] = { calls: 0, tokens: 0, costUsd: 0 }
      byModel[model].calls++
      byModel[model].tokens += tokens
      byModel[model].costUsd += cost

      if (!byProvider[provider]) byProvider[provider] = { calls: 0, tokens: 0, costUsd: 0 }
      byProvider[provider].calls++
      byProvider[provider].tokens += tokens
      byProvider[provider].costUsd += cost
    }

    // Round floats for display
    totalCostUsd = parseFloat(totalCostUsd.toFixed(6))
    for (const s of Object.values(byModel))    s.costUsd = parseFloat(s.costUsd.toFixed(6))
    for (const s of Object.values(byProvider)) s.costUsd = parseFloat(s.costUsd.toFixed(6))

    const budgetUsedPct = budgetLimit ? parseFloat((totalCostUsd / budgetLimit * 100).toFixed(1)) : null
    const alertLevel = classifyBudgetAlert(totalCostUsd, budgetLimit)

    return { userId, month, totalCostUsd, totalTokens, byModel, byProvider, budgetLimitUsd: budgetLimit, budgetUsedPct, alertLevel }
  } catch {
    return empty
  }
}
