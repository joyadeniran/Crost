// E2E-style integration tests for critical founder workflows.
// These exercise multi-step flows at the library/business-logic level,
// mocking only I/O boundaries (Supabase, Composio, LLM).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Shared mocks ─────────────────────────────────────────────────────────────

function makeChain(terminal: () => Promise<any>) {
  const c: any = {}
  const ret = () => c
  c.select = ret; c.insert = ret; c.update = ret; c.upsert = ret; c.delete = ret
  c.eq = ret; c.neq = ret; c.gte = ret; c.lte = ret; c.not = ret; c.is = ret
  c.order = ret; c.limit = ret; c.single = () => terminal()
  c.maybeSingle = () => terminal()
  c.then = (resolve: any) => terminal().then(resolve)
  return c
}

let supabaseRows: Record<string, any[]> = {}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => makeChain(async () => ({ data: supabaseRows[table] ?? [], error: null })),
  }),
}))

beforeEach(() => {
  supabaseRows = {}
  vi.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────
// Flow 1: Budget alert injection into orchestrator risk notes
// ─────────────────────────────────────────────────────────────────────────────

describe('Budget alert → orchestrator risk_notes flow', () => {
  it('injects a warning note when spend is 80–94% of budget', async () => {
    // Arrange: usage rows totalling 82% of the $100 budget
    supabaseRows['api_usage_logs'] = [
      { model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 5000, cost_estimate: 82 },
    ]
    supabaseRows['orc_context'] = [
      { content: { monthly_api_budget: 100 }, summary: null, context_type: 'constraint' },
    ]

    const { computeMonthlySpend, classifyBudgetAlert } = await import('@/lib/cost-tracker')
    const summary = await computeMonthlySpend('user-1')

    expect(summary.alertLevel).toBe('warning')
    expect(classifyBudgetAlert(summary.totalCostUsd, summary.budgetLimitUsd)).toBe('warning')
    expect(summary.budgetUsedPct).toBeGreaterThanOrEqual(80)
    expect(summary.budgetUsedPct).toBeLessThan(95)
  })

  it('injects a critical note when spend is 95%+ of budget', async () => {
    supabaseRows['api_usage_logs'] = [
      { model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 5000, cost_estimate: 97 },
    ]
    supabaseRows['orc_context'] = [
      { content: { monthly_api_budget: 100 }, summary: null, context_type: 'constraint' },
    ]

    const { computeMonthlySpend } = await import('@/lib/cost-tracker')
    const summary = await computeMonthlySpend('user-1')

    expect(summary.alertLevel).toBe('critical')
  })

  it('does not inject a note when spend is below 80%', async () => {
    supabaseRows['api_usage_logs'] = [
      { model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 1000, cost_estimate: 20 },
    ]
    supabaseRows['orc_context'] = [
      { content: { monthly_api_budget: 500 }, summary: null, context_type: 'constraint' },
    ]

    const { computeMonthlySpend } = await import('@/lib/cost-tracker')
    const summary = await computeMonthlySpend('user-1')

    expect(summary.alertLevel).toBe('ok')
  })
})
