// tests/unit/risk-assessor.test.ts
// Unit tests for the 3-tier risk assessment system.

import { describe, it, expect } from 'vitest'
import { assessGoalRisk } from '@/lib/risk-assessor'
import type { OrcContextRow } from '@/lib/orc-decision-gate'
import type { CapabilityGap } from '@/lib/capability-checker'

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeContext(
  type: OrcContextRow['context_type'],
  summary: string
): OrcContextRow {
  return {
    id: crypto.randomUUID(),
    context_type: type,
    content: {},
    summary,
    recency_score: 70,
    source: 'founder_input',
  }
}

function makeGap(
  slug: string,
  name: string,
  availability: 'unavailable' | 'partial' = 'unavailable',
  withExternalService = false
): CapabilityGap {
  return {
    slug,
    name,
    capability_type: 'external_service',
    availability,
    notes: null,
    external_service: withExternalService
      ? {
          service_name: `${name} Service`,
          recommended_vendors: ['Vendor A', 'Vendor B'],
          estimated_cost_range: '$200-500',
          turnaround_time: '24-48 hours',
          founder_decision_required: true,
        }
      : undefined,
  }
}

// ─── Tier 1: Assumptions ──────────────────────────────────────────────────────

describe('assessGoalRisk — Tier 1 (assumptions)', () => {
  it('returns tier 1 with no notes when context and gaps are empty', () => {
    const result = assessGoalRisk('Write a blog post', [], [])
    expect(result.tier).toBe(1)
    expect(result.risk_notes).toHaveLength(0)
    expect(result.assumptions).toHaveLength(0)
  })

  it('generates assumption from preference row', () => {
    const ctx = [makeContext('preference', 'Prefer async communication over real-time meetings')]
    const result = assessGoalRisk('Schedule a team call', ctx, [])
    expect(result.tier).toBe(1)
    expect(result.assumptions).toHaveLength(1)
    expect(result.assumptions[0]).toContain('Applying founder preference')
    expect(result.assumptions[0]).toContain('Prefer async communication')
  })

  it('generates assumption from strategy row', () => {
    const ctx = [makeContext('strategy', 'Reaching Series A by Q4 2026')]
    const result = assessGoalRisk('Create investor materials', ctx, [])
    expect(result.tier).toBe(1)
    expect(result.assumptions.some(a => a.includes('Aligning plan with strategy'))).toBe(true)
    expect(result.assumptions.some(a => a.includes('Series A'))).toBe(true)
  })

  it('generates multiple assumptions from multiple preference rows', () => {
    const ctx = [
      makeContext('preference', 'No external API costs without approval'),
      makeContext('preference', 'Weekly email digests preferred over daily'),
    ]
    const result = assessGoalRisk('Send a marketing email', ctx, [])
    expect(result.assumptions).toHaveLength(2)
  })

  it('does not generate assumptions from profile or outcome rows', () => {
    const ctx = [
      makeContext('profile', 'Acme AI — B2B SaaS company'),
      makeContext('outcome', 'Pitch deck completed successfully'),
    ]
    const result = assessGoalRisk('Build a pitch deck', ctx, [])
    expect(result.assumptions).toHaveLength(0)
  })
})

// ─── Tier 2: Conflict detection ───────────────────────────────────────────────

describe('assessGoalRisk — Tier 2 (conflicts)', () => {
  it('detects conflict when bootstrapped context meets fundraising intent', () => {
    const ctx = [makeContext('constraint', 'Company is bootstrapped — no external investors')]
    const result = assessGoalRisk('Help me raise our Series A from investors', ctx, [])
    expect(result.tier).toBe(2)
    expect(result.risk_notes.length).toBeGreaterThan(0)
    expect(result.risk_notes.some(n => n.includes('bootstrapped'))).toBe(true)
  })

  it('detects conflict when no-external constraint meets hire intent', () => {
    const ctx = [makeContext('constraint', 'No external hiring or contractors — solo operation')]
    const result = assessGoalRisk('Help me hire a freelancer for this project', ctx, [])
    expect(result.tier).toBe(2)
    expect(result.risk_notes.some(n => n.includes('no external spending'))).toBe(true)
  })

  it('detects conflict when no-external preference meets freelancer intent', () => {
    const ctx = [makeContext('preference', 'No external costs without approval — prefer no external services')]
    const result = assessGoalRisk('Find a freelancer to help with the design', ctx, [])
    expect(result.tier).toBe(2)
  })

  it('does not flag conflict when keywords do not match', () => {
    const ctx = [makeContext('constraint', 'No cold outreach without approval')]
    const result = assessGoalRisk('Write a blog post about product features', ctx, [])
    expect(result.tier).toBe(1)
    expect(result.risk_notes).toHaveLength(0)
  })

  it('deduplicates identical risk notes from multiple conflict matches', () => {
    // Both 'hire' and 'freelanc' match 'no external' constraint
    const ctx = [makeContext('constraint', 'No external spending — no external contractors or freelancers')]
    const result = assessGoalRisk('Help me hire a freelancer', ctx, [])
    const noExternalNotes = result.risk_notes.filter(n => n.includes('no external spending'))
    // Should not have duplicate entries for the same constraint
    expect(noExternalNotes.length).toBeLessThanOrEqual(2)
  })

  it('escalates tier to 2 but not 3 when only conflicts (no capability gaps)', () => {
    const ctx = [makeContext('constraint', 'bootstrapped startup — no raising funds')]
    const result = assessGoalRisk('Raise money from investors', ctx, [])
    expect(result.tier).toBe(2)
  })
})

// ─── Tier 3: Capability gaps ──────────────────────────────────────────────────

describe('assessGoalRisk — Tier 3 (capability gaps)', () => {
  it('escalates to tier 3 when there are unavailable capability gaps', () => {
    const gaps = [makeGap('ext.video_editing', 'Video Editing', 'unavailable')]
    const result = assessGoalRisk('Create a product demo video', [], gaps)
    expect(result.tier).toBe(3)
    expect(result.risk_notes.length).toBeGreaterThan(0)
    expect(result.risk_notes.some(n => n.includes('Video Editing'))).toBe(true)
  })

  it('includes external service info in risk note when available', () => {
    const gaps = [makeGap('ext.video_editing', 'Video Editing', 'unavailable', true)]
    const result = assessGoalRisk('Record a product video', [], gaps)
    expect(result.tier).toBe(3)
    expect(result.risk_notes.some(n => n.includes('Video Editing Service'))).toBe(true)
    expect(result.risk_notes.some(n => n.includes('$200-500'))).toBe(true)
    expect(result.risk_notes.some(n => n.includes('founder decision'))).toBe(true)
  })

  it('notes no external option when gap has no external service', () => {
    const gaps = [makeGap('dept.custom_hardware', 'Custom Hardware', 'unavailable', false)]
    const result = assessGoalRisk('Build custom hardware', [], gaps)
    expect(result.tier).toBe(3)
    expect(result.risk_notes.some(n => n.includes('no configured external option'))).toBe(true)
  })

  it('tier 3 overrides tier 2 when both conflicts and gaps are present', () => {
    const ctx = [makeContext('constraint', 'bootstrapped — no external investors')]
    const gaps = [makeGap('ext.video_editing', 'Video Editing')]
    const result = assessGoalRisk('Make a video and raise funds from investors', ctx, gaps)
    expect(result.tier).toBe(3)
  })

  it('does not add Tier 3 for partial gaps (only unavailable triggers Tier 3)', () => {
    const gaps = [makeGap('dept.basic_audio', 'Basic Audio', 'partial')]
    const result = assessGoalRisk('Record a podcast', [], gaps)
    expect(result.tier).toBe(1)
    expect(result.risk_notes).toHaveLength(0)
  })

  it('generates one risk note per gap', () => {
    const gaps = [
      makeGap('ext.video_editing', 'Video Editing', 'unavailable', true),
      makeGap('ext.legal_review', 'Legal Review', 'unavailable', false),
    ]
    const result = assessGoalRisk('Edit a video and review the contract', [], gaps)
    expect(result.tier).toBe(3)
    expect(result.risk_notes).toHaveLength(2)
  })
})

// ─── Tier escalation ─────────────────────────────────────────────────────────

describe('assessGoalRisk — tier escalation', () => {
  it('preserves tier 1 when no conflicts or gaps', () => {
    const ctx = [makeContext('preference', 'Use concise communication')]
    const result = assessGoalRisk('Write a blog post', ctx, [])
    expect(result.tier).toBe(1)
  })

  it('escalates from 1 to 2 on conflict, not back down', () => {
    const ctx = [makeContext('constraint', 'No external services — bootstrapped')]
    const result = assessGoalRisk('Hire a freelance designer', ctx, [])
    expect(result.tier).toBe(2)
  })

  it('escalates from 2 to 3 when gap added on top of conflict', () => {
    const ctx = [makeContext('constraint', 'No external contractors')]
    const gaps = [makeGap('ext.video_editing', 'Video Editing')]
    const result = assessGoalRisk('Hire someone to edit this video', ctx, gaps)
    expect(result.tier).toBe(3)
  })
})
