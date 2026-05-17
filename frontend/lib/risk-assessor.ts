// lib/risk-assessor.ts
// 3-tier risk assessment for goal dispatch.
// Part of ORC_ORCHESTRATION_UPGRADE_PLAN.md §C (Phase 2, Week 4).
// Pure function — no async, no DB calls, designed for fast inline use.

import type { OrcContextRow } from './orc-decision-gate'
import type { CapabilityGap } from './capability-checker'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RiskAssessment {
  tier: 1 | 2 | 3
  risk_notes: string[]
  assumptions: string[]
}

// ─── Conflict patterns ────────────────────────────────────────────────────────

// [context_keyword, intent_keyword, risk_note]
// Match is: context_keyword appears in a constraint/preference row AND intent_keyword appears in the goal.
const CONFLICT_PATTERNS: Array<[string, string, string]> = [
  ['no external',  'hire',        'Constraint: founder prefers no external spending — hiring conflicts with this preference'],
  ['no external',  'freelanc',    'Constraint: founder prefers no external spending — freelancer conflicts with this preference'],
  ['no external',  'contractor',  'Constraint: founder prefers no external spending — contractor conflicts with this preference'],
  ['bootstrapped', 'raise',       'Strategy note: company is bootstrapped — fundraising may conflict with stated strategy'],
  ['bootstrapped', 'investor',    'Strategy note: company is bootstrapped — investor outreach may conflict with stated strategy'],
  ['no cold',      'cold email',  'Constraint: cold outreach may be restricted by founder preference'],
  ['no cold',      'cold outreach','Constraint: cold outreach may be restricted by founder preference'],
  ['no social',    'twitter',     'Constraint: social media posting may be restricted by founder preference'],
  ['no social',    'linkedin',    'Constraint: social media posting may be restricted by founder preference'],
  ['no social',    'instagram',   'Constraint: social media posting may be restricted by founder preference'],
  ['budget',       'expensive',   'Budget constraint may be exceeded — verify cost before proceeding'],
]

// ─── Risk assessment ──────────────────────────────────────────────────────────

/**
 * Assesses the risk of dispatching a goal, using three tiers:
 * - Tier 1 (low):    Generates assumption statements from preference/strategy context.
 * - Tier 2 (medium): Detects conflicts between constraints/preferences and goal intent.
 * - Tier 3 (high):   Escalates when capability gaps are hard-blocked (unavailable + no external).
 *
 * Purely synchronous — uses data already fetched by fetchOrcContext + detectCapabilityGaps.
 * Always returns a valid RiskAssessment (no throws).
 */
export function assessGoalRisk(
  intent: string,
  orcContext: OrcContextRow[],
  capabilityGaps: CapabilityGap[]
): RiskAssessment {
  const risk_notes: string[] = []
  const assumptions: string[] = []
  let tier: 1 | 2 | 3 = 1

  const intentLower = intent.toLowerCase()

  // ── Tier 1: Assumption extraction ─────────────────────────────────────────
  // Surface preferences and strategy as explicit assumptions so Orc can confirm
  // or override them in the plan risk_note.

  const preferenceRows = orcContext.filter(r => r.context_type === 'preference')
  for (const row of preferenceRows) {
    const summary = row.summary ?? JSON.stringify(row.content).slice(0, 150)
    assumptions.push(`Applying founder preference: "${summary}"`)
  }

  const strategyRows = orcContext.filter(r => r.context_type === 'strategy')
  if (strategyRows.length > 0) {
    const strat = strategyRows[0].summary ?? ''
    if (strat) {
      assumptions.push(`Aligning plan with strategy: "${strat.slice(0, 120)}"`)
    }
  }

  // ── Tier 2: Conflict detection ─────────────────────────────────────────────
  // Check if any constraint/preference rows conflict with the goal keywords.

  const constraintRows = orcContext.filter(
    r => r.context_type === 'constraint' || r.context_type === 'preference'
  )

  for (const row of constraintRows) {
    const contextText = (row.summary ?? JSON.stringify(row.content)).toLowerCase()
    for (const [constraintKw, goalKw, note] of CONFLICT_PATTERNS) {
      if (contextText.includes(constraintKw) && intentLower.includes(goalKw)) {
        if (!risk_notes.includes(note)) {
          risk_notes.push(note)
        }
        if (tier < 2) tier = 2
      }
    }
  }

  // ── Tier 3: Capability gap escalation ─────────────────────────────────────
  // Hard gaps (unavailable capabilities) always escalate to Tier 3 because they
  // require explicit founder decisions (hire externally, scope down, or escalate).

  const hardGaps = capabilityGaps.filter(g => g.availability === 'unavailable')
  if (hardGaps.length > 0) {
    for (const gap of hardGaps) {
      if (gap.external_service) {
        const svc = gap.external_service
        const vendors = svc.recommended_vendors.slice(0, 2).join(' or ')
        risk_notes.push(
          `Capability gap: "${gap.name}" unavailable internally. ` +
          `External option available: ${svc.service_name} via ${vendors} ` +
          `(${svc.estimated_cost_range ?? 'cost unknown'}, ${svc.turnaround_time ?? 'timeline unknown'}) — requires founder decision.`
        )
      } else {
        risk_notes.push(
          `Capability gap: "${gap.name}" is unavailable and has no configured external option. ` +
          `Consider escalating to founder or scoping down this goal.`
        )
      }
    }
    tier = 3
  }

  return { tier, risk_notes, assumptions }
}
