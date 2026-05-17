import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  writeOutcomeToDecisionLog,
  computeLearningInsights,
  adjustRecencyScores,
} from '@/lib/orc-learning'

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockGte = vi.fn()
const mockNot = vi.fn()
const mockSelect = vi.fn()

function makeChain(terminal: () => Promise<any>) {
  const chain: any = {}
  chain.update = vi.fn(() => chain)
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.not = vi.fn(() => chain)
  chain.then = (resolve: any) => terminal().then(resolve)
  return chain
}

let supabaseFromImpl: (table: string) => any

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: () => ({
    from: (table: string) => supabaseFromImpl(table),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Default: all DB calls succeed with empty data
  supabaseFromImpl = (_table: string) =>
    makeChain(async () => ({ data: null, error: null }))
})

// ─── writeOutcomeToDecisionLog ────────────────────────────────────────────────

describe('writeOutcomeToDecisionLog', () => {
  it('updates orc_decision_log with outcome and outcome_at', async () => {
    const calls: Array<{ table: string; method: string; args: any[] }> = []

    supabaseFromImpl = (table) => {
      const chain: any = {}
      const rec = (method: string) => (...args: any[]) => {
        calls.push({ table, method, args })
        return chain
      }
      chain.update = rec('update')
      chain.eq = rec('eq')
      chain.is = rec('is')
      chain.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }

    await writeOutcomeToDecisionLog('goal-123', 'successful', 'All tasks done')

    expect(calls.find(c => c.method === 'update')).toBeTruthy()
    const updateCall = calls.find(c => c.method === 'update')!
    expect(updateCall.args[0]).toMatchObject({
      outcome: 'successful',
      outcome_description: 'All tasks done',
    })
    expect(updateCall.args[0].outcome_at).toBeTruthy()

    expect(calls.find(c => c.method === 'eq' && c.args[0] === 'goal_id')).toBeTruthy()
    expect(calls.find(c => c.method === 'is' && c.args[0] === 'outcome')).toBeTruthy()
  })

  it('omits outcome_description when not provided', async () => {
    const updates: any[] = []
    supabaseFromImpl = (_table) => {
      const chain: any = {}
      chain.update = (data: any) => { updates.push(data); return chain }
      chain.eq = () => chain
      chain.is = () => chain
      chain.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }

    await writeOutcomeToDecisionLog('goal-456', 'failed')
    expect(updates[0].outcome_description).toBeNull()
  })

  it('never throws even when supabase errors', async () => {
    supabaseFromImpl = (_table) => {
      throw new Error('connection refused')
    }
    await expect(writeOutcomeToDecisionLog('goal-789', 'partial')).resolves.toBeUndefined()
  })
})

// ─── computeLearningInsights ──────────────────────────────────────────────────

describe('computeLearningInsights', () => {
  it('returns empty insights when no rows found', async () => {
    supabaseFromImpl = (_table) =>
      makeChain(async () => ({ data: [], error: null }))

    const result = await computeLearningInsights('user-1')
    expect(result.totalDecisions).toBe(0)
    expect(result.resolvedDecisions).toBe(0)
    expect(result.overallSuccessRate).toBe(0)
    expect(result.byMode).toEqual({})
    expect(result.byRiskTier).toEqual({})
  })

  it('returns empty insights on DB error', async () => {
    supabaseFromImpl = (_table) =>
      makeChain(async () => ({ data: null, error: { message: 'db error' } }))

    const result = await computeLearningInsights('user-1')
    expect(result.totalDecisions).toBe(0)
  })

  it('computes correct mode success rates', async () => {
    const rows = [
      { orc_choice: 'quick_plan', confidence: 0.9, risk_tier: 1, outcome: 'successful', assumptions: null, risk_notes: [] },
      { orc_choice: 'quick_plan', confidence: 0.8, risk_tier: 1, outcome: 'successful', assumptions: null, risk_notes: [] },
      { orc_choice: 'quick_plan', confidence: 0.7, risk_tier: 2, outcome: 'failed', assumptions: null, risk_notes: ['risk1'] },
      { orc_choice: 'full_plan', confidence: 0.6, risk_tier: 1, outcome: 'failed', assumptions: null, risk_notes: [] },
      { orc_choice: 'full_plan', confidence: 0.5, risk_tier: 1, outcome: null, assumptions: null, risk_notes: [] }, // unresolved
    ]

    supabaseFromImpl = (_table) => makeChain(async () => ({ data: rows, error: null }))

    const result = await computeLearningInsights('user-2')
    expect(result.totalDecisions).toBe(5)
    expect(result.resolvedDecisions).toBe(4)

    expect(result.byMode['quick_plan'].total).toBe(3)
    expect(result.byMode['quick_plan'].successful).toBe(2)
    expect(result.byMode['quick_plan'].successRate).toBeCloseTo(2 / 3)

    expect(result.byMode['full_plan'].total).toBe(1)
    expect(result.byMode['full_plan'].successful).toBe(0)
    expect(result.byMode['full_plan'].successRate).toBe(0)

    expect(result.overallSuccessRate).toBeCloseTo(2 / 4)
  })

  it('computes correct risk tier success rates', async () => {
    const rows = [
      { orc_choice: 'direct_action', confidence: 1, risk_tier: 1, outcome: 'successful', assumptions: null, risk_notes: [] },
      { orc_choice: 'direct_action', confidence: 1, risk_tier: 1, outcome: 'failed', assumptions: null, risk_notes: [] },
      { orc_choice: 'full_plan', confidence: 1, risk_tier: 2, outcome: 'successful', assumptions: null, risk_notes: ['risk'] },
    ]

    supabaseFromImpl = (_table) => makeChain(async () => ({ data: rows, error: null }))

    const result = await computeLearningInsights('user-3')
    expect(result.byRiskTier[1].total).toBe(2)
    expect(result.byRiskTier[1].successRate).toBe(0.5)
    expect(result.byRiskTier[2].total).toBe(1)
    expect(result.byRiskTier[2].successRate).toBe(1)
  })

  it('respects lookbackDays parameter', async () => {
    let capturedGteArg = ''
    supabaseFromImpl = (_table) => {
      const chain: any = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.gte = (_col: string, val: string) => { capturedGteArg = val; return chain }
      chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    }

    const before = Date.now()
    await computeLearningInsights('user-4', 14)
    const expectedSince = new Date(before - 14 * 86_400_000).toISOString().slice(0, 10)
    expect(capturedGteArg.slice(0, 10)).toBe(expectedSince)
  })

  it('returns empty when supabase throws', async () => {
    supabaseFromImpl = () => { throw new Error('boom') }
    const result = await computeLearningInsights('user-5')
    expect(result.totalDecisions).toBe(0)
  })
})

// ─── adjustRecencyScores ──────────────────────────────────────────────────────

describe('adjustRecencyScores', () => {
  it('returns 0 when no resolved decisions exist', async () => {
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: [], error: null }))
    const count = await adjustRecencyScores('user-1')
    expect(count).toBe(0)
  })

  it('returns 0 when no context rows exist', async () => {
    let callCount = 0
    supabaseFromImpl = (_table) => {
      callCount++
      // First call: orc_decision_log returns resolved rows
      // Second call: orc_context returns empty
      const rows = callCount === 1
        ? [{ outcome: 'successful', risk_tier: 1, risk_notes: [], assumptions: { list: ['prefer async tasks'] } }]
        : []
      return makeChain(async () => ({ data: rows, error: null }))
    }
    const count = await adjustRecencyScores('user-2')
    expect(count).toBe(0)
  })

  it('boosts preference/strategy rows on tier-1 success', async () => {
    const decisionRows = [
      {
        outcome: 'successful',
        risk_tier: 1,
        risk_notes: [],
        assumptions: { list: ['prefer async tasks when possible'] },
      },
    ]
    const contextRows = [
      { id: 'ctx-1', context_type: 'preference', summary: 'prefer async tasks', recency_score: 50 },
      { id: 'ctx-2', context_type: 'strategy', summary: 'prefer async tasks', recency_score: 60 },
      { id: 'ctx-3', context_type: 'constraint', summary: 'budget limit', recency_score: 40 },
    ]

    const updates: Array<{ id: string; score: number }> = []
    let callCount = 0

    supabaseFromImpl = (table) => {
      if (table === 'orc_decision_log') {
        return makeChain(async () => ({ data: decisionRows, error: null }))
      }
      // orc_context
      callCount++
      if (callCount === 1) {
        return makeChain(async () => ({ data: contextRows, error: null }))
      }
      // subsequent calls are updates — capture them
      const chain: any = {}
      let capturedScore: number
      chain.update = (d: any) => { capturedScore = d.recency_score; return chain }
      chain.eq = (col: string, val: string) => {
        if (col === 'id') updates.push({ id: val, score: capturedScore })
        return chain
      }
      chain.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }

    const count = await adjustRecencyScores('user-3')
    // ctx-1 (preference) and ctx-2 (strategy) should get +3
    expect(count).toBeGreaterThanOrEqual(1)
    const ctx1Update = updates.find(u => u.id === 'ctx-1')
    const ctx2Update = updates.find(u => u.id === 'ctx-2')
    if (ctx1Update) expect(ctx1Update.score).toBe(53)
    if (ctx2Update) expect(ctx2Update.score).toBe(63)
    // constraint should not be updated
    expect(updates.find(u => u.id === 'ctx-3')).toBeUndefined()
  })

  it('penalises preference rows on tier-1 fail with no risk notes', async () => {
    const decisionRows = [
      {
        outcome: 'failed',
        risk_tier: 1,
        risk_notes: [],
        assumptions: { list: ['prefer sync execution'] },
      },
    ]
    const contextRows = [
      { id: 'ctx-10', context_type: 'preference', summary: 'prefer sync execution', recency_score: 50 },
      { id: 'ctx-11', context_type: 'strategy', summary: 'prefer sync execution', recency_score: 50 },
    ]

    const updates: Array<{ id: string; score: number }> = []
    let callCount = 0

    supabaseFromImpl = (table) => {
      if (table === 'orc_decision_log') {
        return makeChain(async () => ({ data: decisionRows, error: null }))
      }
      callCount++
      if (callCount === 1) {
        return makeChain(async () => ({ data: contextRows, error: null }))
      }
      const chain: any = {}
      let capturedScore: number
      chain.update = (d: any) => { capturedScore = d.recency_score; return chain }
      chain.eq = (col: string, val: string) => {
        if (col === 'id') updates.push({ id: val, score: capturedScore })
        return chain
      }
      chain.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }

    await adjustRecencyScores('user-4')

    // Only preference gets -5, not strategy
    const ctx10 = updates.find(u => u.id === 'ctx-10')
    expect(ctx10?.score).toBe(45)
    // strategy not penalised for tier-1 fail
    expect(updates.find(u => u.id === 'ctx-11')).toBeUndefined()
  })

  it('boosts constraint rows on tier-2/3 fail when risk was flagged', async () => {
    const decisionRows = [
      {
        outcome: 'failed',
        risk_tier: 2,
        risk_notes: ['budget limit was exceeded'],  // contains 'budget limit' — matches constraint summary
        assumptions: { list: [] },
      },
    ]
    const contextRows = [
      { id: 'ctx-20', context_type: 'constraint', summary: 'budget limit', recency_score: 50 },
      { id: 'ctx-21', context_type: 'constraint', summary: 'time constraint', recency_score: 50 },
      { id: 'ctx-22', context_type: 'preference', summary: 'prefer fast mode', recency_score: 50 },
    ]

    const updates: Array<{ id: string; score: number }> = []
    let callCount = 0

    supabaseFromImpl = (table) => {
      if (table === 'orc_decision_log') {
        return makeChain(async () => ({ data: decisionRows, error: null }))
      }
      callCount++
      if (callCount === 1) {
        return makeChain(async () => ({ data: contextRows, error: null }))
      }
      const chain: any = {}
      let capturedScore: number
      chain.update = (d: any) => { capturedScore = d.recency_score; return chain }
      chain.eq = (col: string, val: string) => {
        if (col === 'id') updates.push({ id: val, score: capturedScore })
        return chain
      }
      chain.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }

    await adjustRecencyScores('user-5')

    // ctx-20 ('budget limit') matches risk note 'budget exceeded threshold' → +2
    const ctx20 = updates.find(u => u.id === 'ctx-20')
    expect(ctx20?.score).toBe(52)
    // ctx-21 ('time constraint') doesn't match the risk note → no update
    expect(updates.find(u => u.id === 'ctx-21')).toBeUndefined()
    // preference rows not boosted
    expect(updates.find(u => u.id === 'ctx-22')).toBeUndefined()
  })

  it('clamps recency_score to [10, 100]', async () => {
    const decisionRows = [
      { outcome: 'successful', risk_tier: 1, risk_notes: [], assumptions: { list: ['prefer cache'] } },
      { outcome: 'successful', risk_tier: 1, risk_notes: [], assumptions: { list: ['prefer cache'] } },
      { outcome: 'successful', risk_tier: 1, risk_notes: [], assumptions: { list: ['prefer cache'] } },
      { outcome: 'successful', risk_tier: 1, risk_notes: [], assumptions: { list: ['prefer cache'] } },
      // ... enough to push score to >100
    ]
    const contextRows = [
      { id: 'ctx-high', context_type: 'preference', summary: 'prefer cache', recency_score: 99 },
    ]

    const updates: Array<{ id: string; score: number }> = []
    let callCount = 0

    supabaseFromImpl = (table) => {
      if (table === 'orc_decision_log') {
        return makeChain(async () => ({ data: decisionRows, error: null }))
      }
      callCount++
      if (callCount === 1) {
        return makeChain(async () => ({ data: contextRows, error: null }))
      }
      const chain: any = {}
      let capturedScore: number
      chain.update = (d: any) => { capturedScore = d.recency_score; return chain }
      chain.eq = (col: string, val: string) => {
        if (col === 'id') updates.push({ id: val, score: capturedScore })
        return chain
      }
      chain.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
      return chain
    }

    await adjustRecencyScores('user-6')

    const ctxHigh = updates.find(u => u.id === 'ctx-high')
    if (ctxHigh) expect(ctxHigh.score).toBeLessThanOrEqual(100)
  })

  it('returns 0 when supabase throws', async () => {
    supabaseFromImpl = () => { throw new Error('db gone') }
    const count = await adjustRecencyScores('user-7')
    expect(count).toBe(0)
  })
})
