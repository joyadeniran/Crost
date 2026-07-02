/**
 * Unit tests: lib/cost-table.ts — estimateCost.
 */
import { describe, it, expect } from 'vitest'
import { estimateCost, COST_TABLE } from '@/lib/cost-table'

describe('estimateCost', () => {
  it('computes cost for a known model using its own pricing', () => {
    const cost = estimateCost('gemini/gemini-2.5-flash', 1_000_000, 0)
    expect(cost).toBeCloseTo(0.075, 6)
  })

  it('includes both prompt and completion token costs', () => {
    const pricing = COST_TABLE['anthropic/claude-sonnet-4.6']
    const cost = estimateCost('anthropic/claude-sonnet-4.6', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(pricing.prompt + pricing.completion, 6)
  })

  it('falls back to default pricing for unknown models', () => {
    const cost = estimateCost('unknown/model-x', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(1.0 + 3.0, 6)
  })

  it('returns 0 for zero tokens', () => {
    expect(estimateCost('groq/llama-3.3-70b-versatile', 0, 0)).toBe(0)
  })

  it('rounds to 8 decimal places', () => {
    const cost = estimateCost('groq/llama-3.3-70b-versatile', 1234, 567)
    const str = cost.toString()
    const decimals = str.includes('.') ? str.split('.')[1].length : 0
    expect(decimals).toBeLessThanOrEqual(8)
  })
})
