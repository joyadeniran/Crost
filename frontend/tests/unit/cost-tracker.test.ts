import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  classifyBudgetAlert,
  getBudgetConstraint,
  computeMonthlySpend,
  type MonthlyCostSummary,
} from '@/lib/cost-tracker'

// ─── Supabase mock ────────────────────────────────────────────────────────────

function makeChain(terminal: () => Promise<any>) {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.then = (resolve: any) => terminal().then(resolve)
  return chain
}

let tableImpl: Record<string, () => any> = {}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => {
      const impl = tableImpl[table]
      return impl ? impl() : makeChain(async () => ({ data: [], error: null }))
    },
  }),
}))

beforeEach(() => {
  tableImpl = {}
})

// ─── classifyBudgetAlert ──────────────────────────────────────────────────────

describe('classifyBudgetAlert', () => {
  it('returns null when limit is null', () => {
    expect(classifyBudgetAlert(100, null)).toBeNull()
  })

  it('returns null when limit is 0', () => {
    expect(classifyBudgetAlert(0, 0)).toBeNull()
  })

  it('returns ok when below 80%', () => {
    expect(classifyBudgetAlert(79, 100)).toBe('ok')
    expect(classifyBudgetAlert(0, 500)).toBe('ok')
    expect(classifyBudgetAlert(399, 500)).toBe('ok')
  })

  it('returns warning at 80–94%', () => {
    expect(classifyBudgetAlert(80, 100)).toBe('warning')
    expect(classifyBudgetAlert(94, 100)).toBe('warning')
    expect(classifyBudgetAlert(400, 500)).toBe('warning')
  })

  it('returns critical at 95%+', () => {
    expect(classifyBudgetAlert(95, 100)).toBe('critical')
    expect(classifyBudgetAlert(100, 100)).toBe('critical')
    expect(classifyBudgetAlert(600, 500)).toBe('critical')
  })
})

// ─── getBudgetConstraint ──────────────────────────────────────────────────────

describe('getBudgetConstraint', () => {
  it('returns null when no constraint rows exist', async () => {
    tableImpl['orc_context'] = () => makeChain(async () => ({ data: [], error: null }))
    expect(await getBudgetConstraint('user-1')).toBeNull()
  })

  it('reads monthly_api_budget from content JSONB', async () => {
    tableImpl['orc_context'] = () => makeChain(async () => ({
      data: [{ content: { monthly_api_budget: 500 }, summary: 'API budget: $500/month' }],
      error: null,
    }))
    expect(await getBudgetConstraint('user-1')).toBe(500)
  })

  it('parses dollar amount from summary when content has no budget', async () => {
    tableImpl['orc_context'] = () => makeChain(async () => ({
      data: [{ content: {}, summary: 'Monthly API budget: $300' }],
      error: null,
    }))
    expect(await getBudgetConstraint('user-1')).toBe(300)
  })

  it('prefers content over summary when both present', async () => {
    tableImpl['orc_context'] = () => makeChain(async () => ({
      data: [{ content: { monthly_api_budget: 400 }, summary: 'Budget: $100' }],
      error: null,
    }))
    expect(await getBudgetConstraint('user-1')).toBe(400)
  })

  it('returns null when summary mentions budget but has no dollar amount', async () => {
    tableImpl['orc_context'] = () => makeChain(async () => ({
      data: [{ content: {}, summary: 'Keep API budget in check' }],
      error: null,
    }))
    expect(await getBudgetConstraint('user-1')).toBeNull()
  })

  it('returns null on DB error', async () => {
    tableImpl['orc_context'] = () => makeChain(async () => ({ data: null, error: { message: 'db error' } }))
    expect(await getBudgetConstraint('user-1')).toBeNull()
  })

  it('returns null when supabase throws', async () => {
    tableImpl['orc_context'] = () => { throw new Error('boom') }
    expect(await getBudgetConstraint('user-1')).toBeNull()
  })
})

// ─── computeMonthlySpend ──────────────────────────────────────────────────────

describe('computeMonthlySpend', () => {
  it('returns zero-spend summary when no usage rows', async () => {
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: [], error: null }))
    tableImpl['orc_context'] = () => makeChain(async () => ({ data: [], error: null }))

    const result = await computeMonthlySpend('user-1')
    expect(result.totalCostUsd).toBe(0)
    expect(result.totalTokens).toBe(0)
    expect(result.byModel).toEqual({})
    expect(result.byProvider).toEqual({})
    expect(result.alertLevel).toBeNull()
  })

  it('aggregates tokens and cost by model and provider', async () => {
    const rows = [
      { model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 1000, cost_estimate: 0.001 },
      { model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 2000, cost_estimate: 0.002 },
      { model: 'gemini/gemini-2.5-flash',       provider: 'gemini', total_tokens: 500, cost_estimate: 0.0005 },
    ]
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: rows, error: null }))
    tableImpl['orc_context']    = () => makeChain(async () => ({ data: [], error: null }))

    const result = await computeMonthlySpend('user-1')
    expect(result.totalTokens).toBe(3500)
    expect(result.totalCostUsd).toBeCloseTo(0.0035, 5)
    expect(result.byModel['groq/llama-3.3-70b-versatile'].calls).toBe(2)
    expect(result.byModel['groq/llama-3.3-70b-versatile'].tokens).toBe(3000)
    expect(result.byModel['gemini/gemini-2.5-flash'].calls).toBe(1)
    expect(result.byProvider['groq'].calls).toBe(2)
    expect(result.byProvider['gemini'].calls).toBe(1)
  })

  it('sets alertLevel=warning when spend is 80–94% of budget', async () => {
    const rows = [{ model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 10000, cost_estimate: 40 }]
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: rows, error: null }))
    tableImpl['orc_context']    = () => makeChain(async () => ({
      data: [{ content: { monthly_api_budget: 50 }, summary: null }],
      error: null,
    }))

    const result = await computeMonthlySpend('user-1')
    expect(result.budgetLimitUsd).toBe(50)
    expect(result.budgetUsedPct).toBe(80)
    expect(result.alertLevel).toBe('warning')
  })

  it('sets alertLevel=critical when spend is 95%+ of budget', async () => {
    const rows = [{ model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 10000, cost_estimate: 96 }]
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: rows, error: null }))
    tableImpl['orc_context']    = () => makeChain(async () => ({
      data: [{ content: { monthly_api_budget: 100 }, summary: null }],
      error: null,
    }))

    const result = await computeMonthlySpend('user-1')
    expect(result.alertLevel).toBe('critical')
  })

  it('sets alertLevel=ok when spend is below 80% of budget', async () => {
    const rows = [{ model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 1000, cost_estimate: 10 }]
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: rows, error: null }))
    tableImpl['orc_context']    = () => makeChain(async () => ({
      data: [{ content: { monthly_api_budget: 500 }, summary: null }],
      error: null,
    }))

    const result = await computeMonthlySpend('user-1')
    expect(result.alertLevel).toBe('ok')
    expect(result.budgetUsedPct).toBe(2)
  })

  it('sets alertLevel=null when no budget is configured', async () => {
    const rows = [{ model: 'groq/llama-3.3-70b-versatile', provider: 'groq', total_tokens: 1000, cost_estimate: 10 }]
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: rows, error: null }))
    tableImpl['orc_context']    = () => makeChain(async () => ({ data: [], error: null }))

    const result = await computeMonthlySpend('user-1')
    expect(result.alertLevel).toBeNull()
    expect(result.budgetLimitUsd).toBeNull()
    expect(result.budgetUsedPct).toBeNull()
  })

  it('returns empty summary on DB error (fail-open)', async () => {
    tableImpl['api_usage_logs'] = () => { throw new Error('connection refused') }
    tableImpl['orc_context']    = () => makeChain(async () => ({ data: [], error: null }))

    const result = await computeMonthlySpend('user-1')
    expect(result.totalCostUsd).toBe(0)
    expect(result.alertLevel).toBeNull()
  })

  it('includes the correct month string', async () => {
    tableImpl['api_usage_logs'] = () => makeChain(async () => ({ data: [], error: null }))
    tableImpl['orc_context']    = () => makeChain(async () => ({ data: [], error: null }))

    const result = await computeMonthlySpend('user-1')
    expect(result.month).toMatch(/^\d{4}-\d{2}$/)
    const now = new Date()
    const expected = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    expect(result.month).toBe(expected)
  })
})
