// tests/unit/recurring-missions.test.ts
// Unit tests for calculateNextRun and checkAutoDispatchEligibility.

import { describe, it, expect } from 'vitest'
import { calculateNextRun, checkAutoDispatchEligibility } from '@/lib/recurring-missions'
import type { RecurringMission } from '@/lib/recurring-missions'

// ─── calculateNextRun ─────────────────────────────────────────────────────────

describe('calculateNextRun', () => {
  it('daily: returns next calendar day at 9am', () => {
    const from = new Date('2026-05-17T14:00:00')
    const result = calculateNextRun('daily', from)
    expect(result.getHours()).toBe(9)
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
    // Must be at least 1 day ahead in calendar date
    expect(result.getDate()).toBe(from.getDate() + 1)
    expect(result.getMonth()).toBe(from.getMonth())
  })

  it('weekly: returns +7 calendar days at 9am', () => {
    const from = new Date('2026-05-10T10:00:00')
    const result = calculateNextRun('weekly', from)
    expect(result.getHours()).toBe(9)
    // +7 days: May 10 → May 17
    expect(result.getDate()).toBe(from.getDate() + 7)
    expect(result.getMonth()).toBe(from.getMonth())
  })

  it('monthly: returns next month same day at 9am', () => {
    const from = new Date('2026-05-17T10:00:00.000Z')
    const result = calculateNextRun('monthly', from)
    expect(result.getHours()).toBe(9)
    expect(result.getMonth()).toBe(5) // June (0-indexed)
    expect(result.getDate()).toBe(17)
  })

  it('monthly: clamps day to end of month when cadence_day exceeds days in month', () => {
    // cadence_day = 31, but June has 30 days
    const from = new Date('2026-05-01T10:00:00.000Z')
    const result = calculateNextRun('monthly', from, 31)
    expect(result.getMonth()).toBe(5) // June
    expect(result.getDate()).toBe(30) // clamped to June 30
  })

  it('monthly: uses cadence_day when provided and within range', () => {
    const from = new Date('2026-05-01T10:00:00.000Z')
    const result = calculateNextRun('monthly', from, 15)
    expect(result.getMonth()).toBe(5) // June
    expect(result.getDate()).toBe(15)
  })

  it('always returns midnight-aligned time (seconds and ms = 0)', () => {
    const from = new Date('2026-05-17T22:30:45.123Z')
    const result = calculateNextRun('daily', from)
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
  })
})

// ─── checkAutoDispatchEligibility ────────────────────────────────────────────

function makeMission(overrides: Partial<Pick<RecurringMission, 'auto_dispatch' | 'risk_tier_limit'>> = {}): Pick<RecurringMission, 'auto_dispatch' | 'risk_tier_limit'> {
  return {
    auto_dispatch: true,
    risk_tier_limit: 1,
    ...overrides,
  }
}

describe('checkAutoDispatchEligibility', () => {
  it('returns true for quick_plan + tier 1 + no risk notes', () => {
    const result = checkAutoDispatchEligibility(makeMission(), {
      mode: 'quick_plan', risk_notes: [], risk_tier: 1,
    })
    expect(result).toBe(true)
  })

  it('returns true for direct_action + tier 1 + no risk notes', () => {
    const result = checkAutoDispatchEligibility(makeMission(), {
      mode: 'direct_action', risk_notes: [], risk_tier: 1,
    })
    expect(result).toBe(true)
  })

  it('returns false when auto_dispatch is false', () => {
    const result = checkAutoDispatchEligibility(makeMission({ auto_dispatch: false }), {
      mode: 'quick_plan', risk_notes: [], risk_tier: 1,
    })
    expect(result).toBe(false)
  })

  it('returns false for full_plan mode (not eligible for auto-dispatch)', () => {
    const result = checkAutoDispatchEligibility(makeMission(), {
      mode: 'full_plan', risk_notes: [], risk_tier: 1,
    })
    expect(result).toBe(false)
  })

  it('returns false when risk_notes is non-empty', () => {
    const result = checkAutoDispatchEligibility(makeMission(), {
      mode: 'quick_plan', risk_notes: ['Constraint: bootstrapped company'], risk_tier: 1,
    })
    expect(result).toBe(false)
  })

  it('returns false when risk_tier exceeds risk_tier_limit', () => {
    const result = checkAutoDispatchEligibility(makeMission({ risk_tier_limit: 1 }), {
      mode: 'quick_plan', risk_notes: [], risk_tier: 2,
    })
    expect(result).toBe(false)
  })

  it('returns true when risk_tier equals risk_tier_limit', () => {
    const result = checkAutoDispatchEligibility(makeMission({ risk_tier_limit: 2 }), {
      mode: 'quick_plan', risk_notes: [], risk_tier: 2,
    })
    expect(result).toBe(true)
  })

  it('returns true when risk_tier is below risk_tier_limit', () => {
    const result = checkAutoDispatchEligibility(makeMission({ risk_tier_limit: 3 }), {
      mode: 'direct_action', risk_notes: [], risk_tier: 1,
    })
    expect(result).toBe(true)
  })

  it('defaults risk_tier to 1 when not provided', () => {
    const result = checkAutoDispatchEligibility(makeMission({ risk_tier_limit: 1 }), {
      mode: 'quick_plan', risk_notes: [],
      // risk_tier omitted
    })
    expect(result).toBe(true)
  })

  it('returns false for escalate mode', () => {
    const result = checkAutoDispatchEligibility(makeMission({ risk_tier_limit: 3 }), {
      mode: 'escalate', risk_notes: [], risk_tier: 1,
    })
    expect(result).toBe(false)
  })
})
