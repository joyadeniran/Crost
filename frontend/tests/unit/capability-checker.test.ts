// tests/unit/capability-checker.test.ts
// Unit tests for detectCapabilityGaps and formatCapabilityGapsForPrompt.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  detectCapabilityGaps,
  formatCapabilityGapsForPrompt,
  type CapabilitySummary,
} from '@/lib/capability-checker'

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockCaps: any[] = []
const mockExtServices: any[] = []

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      // Each from() call creates a fresh builder that captures the table name.
      // This prevents a shared closure variable from being overwritten when two
      // queries run in Promise.all (as detectCapabilityGaps does).
      const tableName = table
      const builder: any = {
        select: vi.fn(() => builder),
        eq:     vi.fn(() => builder),
        order:  vi.fn(() => builder),
        limit:  vi.fn(() => builder),
        then:   vi.fn((resolve: any) => {
          if (tableName === 'capability_inventory') {
            return Promise.resolve({ data: mockCaps, error: null }).then(resolve)
          }
          if (tableName === 'external_services') {
            return Promise.resolve({ data: mockExtServices, error: null }).then(resolve)
          }
          return Promise.resolve({ data: [], error: null }).then(resolve)
        }),
      }
      return builder
    }),
  })),
}))

beforeEach(() => {
  mockCaps.length = 0
  mockExtServices.length = 0
})

// ─── formatCapabilityGapsForPrompt ────────────────────────────────────────────

describe('formatCapabilityGapsForPrompt', () => {
  it('returns empty string when no gaps or partials', () => {
    const summary: CapabilitySummary = { available: ['Content Writing'], partial: [], gaps: [], promptText: '' }
    expect(formatCapabilityGapsForPrompt(summary)).toBe('')
  })

  it('formats a gap with an external service option', () => {
    const summary: CapabilitySummary = {
      available: [],
      partial: [],
      gaps: [{
        slug: 'ext.video_editing',
        name: 'Video Editing',
        capability_type: 'external_service',
        availability: 'unavailable',
        notes: null,
        external_service: {
          service_name: 'Video Editing',
          recommended_vendors: ['Fiverr', 'Upwork'],
          estimated_cost_range: '$200-500',
          turnaround_time: '24-48 hours',
          founder_decision_required: true,
        },
      }],
      promptText: '',
    }
    const result = formatCapabilityGapsForPrompt(summary)
    expect(result).toContain('CAPABILITY GAPS DETECTED:')
    expect(result).toContain('Video Editing')
    expect(result).toContain('UNAVAILABLE internally')
    expect(result).toContain('Fiverr')
    expect(result).toContain('$200-500')
    expect(result).toContain('founder approval required')
  })

  it('formats a gap without external service option', () => {
    const summary: CapabilitySummary = {
      available: [],
      partial: [],
      gaps: [{
        slug: 'dept.custom_hardware',
        name: 'Custom Hardware',
        capability_type: 'specialized',
        availability: 'unavailable',
        notes: null,
        external_service: undefined,
      }],
      promptText: '',
    }
    const result = formatCapabilityGapsForPrompt(summary)
    expect(result).toContain('no external option configured')
    expect(result).toContain('Custom Hardware')
  })

  it('formats partial capabilities separately from full gaps', () => {
    const summary: CapabilitySummary = {
      available: [],
      partial: ['Basic Video', 'Simple Audio'],
      gaps: [],
      promptText: '',
    }
    const result = formatCapabilityGapsForPrompt(summary)
    expect(result).toContain('PARTIAL CAPABILITIES')
    expect(result).toContain('Basic Video')
    expect(result).toContain('Simple Audio')
  })

  it('includes both gaps and partial sections when both present', () => {
    const summary: CapabilitySummary = {
      available: [],
      partial: ['Basic Audio'],
      gaps: [{
        slug: 'ext.video_editing',
        name: 'Video Editing',
        capability_type: 'external_service',
        availability: 'unavailable',
        notes: null,
      }],
      promptText: '',
    }
    const result = formatCapabilityGapsForPrompt(summary)
    expect(result).toContain('CAPABILITY GAPS DETECTED:')
    expect(result).toContain('PARTIAL CAPABILITIES')
  })
})

// ─── detectCapabilityGaps ─────────────────────────────────────────────────────

describe('detectCapabilityGaps', () => {
  it('returns empty summary when capability_inventory is empty', async () => {
    const result = await detectCapabilityGaps('Create a video demo')
    expect(result.available).toEqual([])
    expect(result.partial).toEqual([])
    expect(result.gaps).toEqual([])
    expect(result.promptText).toBe('')
  })

  it('separates available capabilities from gaps', async () => {
    mockCaps.push(
      {
        capability_slug: 'dept.content',
        display_name: 'Content Writing',
        capability_type: 'department',
        availability_status: 'available',
        description: 'Write blog posts and articles',
        skill_tags: ['writing', 'content'],
        notes: null,
      },
      {
        capability_slug: 'ext.video_editing',
        display_name: 'Video Editing',
        capability_type: 'external_service',
        availability_status: 'unavailable',
        description: 'Post-production video editing',
        skill_tags: ['video', 'editing', 'animation'],
        notes: 'Requires external hire',
      }
    )

    const result = await detectCapabilityGaps('Create a video tutorial for our product')
    expect(result.available).toContain('Content Writing')
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].slug).toBe('ext.video_editing')
    expect(result.gaps[0].availability).toBe('unavailable')
  })

  it('filters out irrelevant unavailable capabilities', async () => {
    mockCaps.push({
      capability_slug: 'ext.financial_audit',
      display_name: 'Financial Audit',
      capability_type: 'external_service',
      availability_status: 'unavailable',
      description: 'CPA-level financial review',
      skill_tags: ['audit', 'finance', 'CPA'],
      notes: null,
    })

    // Goal has nothing to do with finance
    const result = await detectCapabilityGaps('Write a blog post about our product launch')
    expect(result.gaps).toHaveLength(0)
  })

  it('attaches external service to matching gap', async () => {
    mockCaps.push({
      capability_slug: 'ext.video_editing',
      display_name: 'Video Editing',
      capability_type: 'external_service',
      availability_status: 'unavailable',
      description: 'Post-production video editing',
      skill_tags: ['video', 'editing'],
      notes: null,
    })
    mockExtServices.push({
      service_name: 'Video Editing Service',
      category: 'external_service',
      when_to_use: 'When founder needs video editing',
      recommended_vendors: ['Fiverr', 'Upwork'],
      estimated_cost_range: '$200-500',
      turnaround_time: '24-48 hours',
      founder_decision_required: true,
      related_capability_slug: 'ext.video_editing',
    })

    const result = await detectCapabilityGaps('Produce a video demo for investors')
    expect(result.gaps).toHaveLength(1)
    expect(result.gaps[0].external_service).toBeDefined()
    expect(result.gaps[0].external_service?.service_name).toBe('Video Editing Service')
    expect(result.gaps[0].external_service?.recommended_vendors).toContain('Fiverr')
  })

  it('adds partial capabilities that match the intent', async () => {
    mockCaps.push({
      capability_slug: 'dept.basic_audio',
      display_name: 'Basic Audio',
      capability_type: 'department',
      availability_status: 'partial',
      description: 'Basic audio recording and processing',
      skill_tags: ['audio', 'recording', 'podcast'],
      notes: 'Limited to simple recordings',
    })

    const result = await detectCapabilityGaps('Record a podcast episode')
    expect(result.partial).toContain('Basic Audio')
  })

  it('does not add partial capabilities irrelevant to intent', async () => {
    mockCaps.push({
      capability_slug: 'dept.basic_audio',
      display_name: 'Basic Audio',
      capability_type: 'department',
      availability_status: 'partial',
      description: 'Basic audio recording',
      skill_tags: ['audio', 'recording'],
      notes: null,
    })

    // Goal has nothing to do with audio
    const result = await detectCapabilityGaps('Write a pitch deck for Series A fundraising')
    expect(result.partial).not.toContain('Basic Audio')
  })

  it('returns empty summary on DB error (fail-open)', async () => {
    // Re-mock supabase to throw an error
    const { createServerSupabaseClient } = await import('@/lib/supabase')
    vi.mocked(createServerSupabaseClient).mockImplementationOnce(() => {
      throw new Error('DB connection failed')
    })

    const result = await detectCapabilityGaps('Create a video')
    expect(result.available).toEqual([])
    expect(result.gaps).toEqual([])
  })

  it('sets promptText on the returned summary', async () => {
    mockCaps.push({
      capability_slug: 'ext.video_editing',
      display_name: 'Video Editing',
      capability_type: 'external_service',
      availability_status: 'unavailable',
      description: 'Video editing',
      skill_tags: ['video'],
      notes: null,
    })

    const result = await detectCapabilityGaps('Record and edit a product video')
    expect(result.promptText).toContain('CAPABILITY GAPS DETECTED:')
    expect(result.promptText).toContain('Video Editing')
  })
})
