// tests/unit/orc-decision-gate.test.ts
// Unit tests for Brain 1 (fetchOrcContext, seedOrcContextFromMemo) and
// Brain 2 (orcDecisionGate) from ORC_ORCHESTRATION_UPGRADE_PLAN.md §B.1

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  formatOrcContextForPrompt,
  orcDecisionGate,
  type OrcContextRow,
  type OrcDecision,
} from '@/lib/orc-decision-gate'

// ─── Supabase mock ───────────────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    data: null,
    error: null,
  })),
}))

// ─── formatOrcContextForPrompt ────────────────────────────────────────────────

describe('formatOrcContextForPrompt', () => {
  it('returns empty string for empty array', () => {
    expect(formatOrcContextForPrompt([])).toBe('')
  })

  it('formats a profile row', () => {
    const rows: OrcContextRow[] = [{
      id: 'abc',
      context_type: 'profile',
      content: { name: 'Acme AI' },
      summary: 'Acme AI (B2B SaaS) - AI automation for creative teams',
      recency_score: 80,
      source: 'extracted_from_memos',
    }]
    const result = formatOrcContextForPrompt(rows)
    expect(result).toContain('COMPANY PROFILE:')
    expect(result).toContain('Acme AI (B2B SaaS)')
  })

  it('falls back to JSON snippet when summary is null', () => {
    const rows: OrcContextRow[] = [{
      id: 'xyz',
      context_type: 'constraint',
      content: { monthly_api_budget: 500 },
      summary: null,
      recency_score: 60,
      source: 'founder_input',
    }]
    const result = formatOrcContextForPrompt(rows)
    expect(result).toContain('CONSTRAINTS:')
    expect(result).toContain('monthly_api_budget')
  })

  it('groups multiple rows by context_type', () => {
    const rows: OrcContextRow[] = [
      { id: '1', context_type: 'profile',    content: {}, summary: 'Company A',  recency_score: 80, source: 'founder_input' },
      { id: '2', context_type: 'strategy',   content: {}, summary: 'Reach $10M', recency_score: 70, source: 'founder_input' },
      { id: '3', context_type: 'preference', content: {}, summary: 'Fast approvals', recency_score: 65, source: 'founder_input' },
      { id: '4', context_type: 'constraint', content: {}, summary: '$500/mo budget', recency_score: 60, source: 'founder_input' },
      { id: '5', context_type: 'outcome',    content: {}, summary: 'Pitch deck done', recency_score: 75, source: 'inferred_from_missions' },
    ]
    const result = formatOrcContextForPrompt(rows)
    expect(result).toContain('COMPANY PROFILE:')
    expect(result).toContain('STRATEGIC GOALS:')
    expect(result).toContain('FOUNDER PREFERENCES:')
    expect(result).toContain('CONSTRAINTS:')
    expect(result).toContain('PAST OUTCOMES:')
  })

  it('handles multiple rows of the same type', () => {
    const rows: OrcContextRow[] = [
      { id: '1', context_type: 'strategy', content: {}, summary: 'Reach $10M ARR', recency_score: 80, source: 'founder_input' },
      { id: '2', context_type: 'strategy', content: {}, summary: 'Series A by Q4', recency_score: 75, source: 'founder_input' },
    ]
    const result = formatOrcContextForPrompt(rows)
    expect(result).toContain('Reach $10M ARR')
    expect(result).toContain('Series A by Q4')
  })
})

// ─── orcDecisionGate ─────────────────────────────────────────────────────────

describe('orcDecisionGate', () => {
  const emptyContext: OrcContextRow[] = []

  function mockLLMResponse(body: object) {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(body) } }]
      }), { status: 200 })
    )
  }

  function mockLLMFailure(status = 500) {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Internal Server Error', { status })
    )
  }

  // ── Mode classification ──────────────────────────────────────────────────

  it('classifies "Who are you?" as assistant mode', async () => {
    mockLLMResponse({
      mode: 'assistant',
      confidence: 0.98,
      reasoning: 'Simple identity question answerable directly.',
      risk_notes: [],
      followup_options: ['What can you do?', 'Set up my company'],
    })
    const result = await orcDecisionGate('Who are you?', emptyContext)
    expect(result.mode).toBe('assistant')
    expect(result.confidence).toBeGreaterThanOrEqual(0.9)
  })

  it('classifies a complex strategic goal as full_plan', async () => {
    mockLLMResponse({
      mode: 'full_plan',
      confidence: 0.92,
      reasoning: 'Multi-department goal with strategic implications.',
      risk_notes: ['Onboarding redesign requires Engineering + Sales + Marketing coordination'],
      followup_options: ['Approve full plan', 'Start Phase 1 only', 'Get timeline'],
    })
    const result = await orcDecisionGate('Redesign our entire customer onboarding flow', emptyContext)
    expect(result.mode).toBe('full_plan')
    expect(result.risk_notes.length).toBeGreaterThan(0)
  })

  it('classifies "Create social posts for this week" as quick_plan', async () => {
    mockLLMResponse({
      mode: 'quick_plan',
      confidence: 0.88,
      reasoning: 'Routine content task matching historical patterns.',
      risk_notes: [],
      followup_options: ['Dispatch now', 'Modify plan', 'Schedule for later'],
    })
    const result = await orcDecisionGate('Create social posts for this week', emptyContext)
    expect(result.mode).toBe('quick_plan')
  })

  it('classifies a pitch deck request with missing info as clarify', async () => {
    mockLLMResponse({
      mode: 'clarify',
      confidence: 0.85,
      reasoning: 'Audience and update scope unknown — two focused questions needed.',
      risk_notes: ['Audience type missing', 'Whether to update existing deck or create new is unclear'],
      followup_options: ['Proceed with assumptions', 'Answer questions first'],
    })
    const result = await orcDecisionGate('Design a pitch deck', emptyContext)
    expect(result.mode).toBe('clarify')
    expect(result.risk_notes.length).toBeGreaterThanOrEqual(1)
  })

  it('classifies "Send this to alice@example.com" as direct_action', async () => {
    mockLLMResponse({
      mode: 'direct_action',
      confidence: 0.95,
      reasoning: 'Explicit send action with a clear recipient — low-risk execution.',
      risk_notes: [],
      followup_options: ['Approve send', 'Cancel'],
    })
    const result = await orcDecisionGate('Send the pitch deck to alice@example.com', emptyContext)
    expect(result.mode).toBe('direct_action')
  })

  it('classifies "Retry the last task" as command', async () => {
    mockLLMResponse({
      mode: 'command',
      confidence: 0.97,
      reasoning: 'Explicit system retry command.',
      risk_notes: [],
      followup_options: ['Confirm retry', 'Cancel'],
    })
    const result = await orcDecisionGate('Retry the last task', emptyContext)
    expect(result.mode).toBe('command')
  })

  it('classifies "Create a 30-second video" as escalate', async () => {
    mockLLMResponse({
      mode: 'escalate',
      confidence: 0.9,
      reasoning: 'Video editing capability unavailable — alternatives should be surfaced.',
      risk_notes: ['Video editing not in capability inventory'],
      followup_options: ['Write animation script instead', 'Hire external editor', 'Do slide deck'],
    })
    const result = await orcDecisionGate('Create a 30-second product demo video', emptyContext)
    expect(result.mode).toBe('escalate')
  })

  // ── Resilience ────────────────────────────────────────────────────────────

  it('falls back to full_plan on HTTP error', async () => {
    mockLLMFailure(503)
    const result = await orcDecisionGate('Do something complex', emptyContext)
    expect(result.mode).toBe('full_plan')
    expect(result.confidence).toBe(0.5)
  })

  it('falls back to full_plan on invalid JSON from LLM', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [{ message: { content: 'This is not JSON at all' } }]
      }), { status: 200 })
    )
    const result = await orcDecisionGate('Plan something', emptyContext)
    expect(result.mode).toBe('full_plan')
  })

  it('falls back to full_plan on unknown mode string', async () => {
    mockLLMResponse({ mode: 'hallucinated_mode', confidence: 0.9, reasoning: '...', risk_notes: [], followup_options: [] })
    const result = await orcDecisionGate('Do something', emptyContext)
    expect(result.mode).toBe('full_plan')
  })

  it('falls back to full_plan on fetch network error', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'))
    const result = await orcDecisionGate('Do something', emptyContext)
    expect(result.mode).toBe('full_plan')
    expect(result.confidence).toBe(0.5)
  })

  // ── Confidence clamping ───────────────────────────────────────────────────

  it('clamps confidence to [0.5, 1.0]', async () => {
    mockLLMResponse({ mode: 'assistant', confidence: 0.1, reasoning: 'test', risk_notes: [], followup_options: [] })
    const low = await orcDecisionGate('hi', emptyContext)
    expect(low.confidence).toBe(0.5)

    mockLLMResponse({ mode: 'quick_plan', confidence: 9.9, reasoning: 'test', risk_notes: [], followup_options: [] })
    const high = await orcDecisionGate('create posts', emptyContext)
    expect(high.confidence).toBe(1.0)
  })

  // ── Context-aware classification ──────────────────────────────────────────

  it('passes context summary to the classifier prompt', async () => {
    const context: OrcContextRow[] = [{
      id: '1',
      context_type: 'strategy',
      content: {},
      summary: 'Raising Series A by Q4 2026',
      recency_score: 80,
      source: 'extracted_from_memos',
    }]

    mockLLMResponse({ mode: 'full_plan', confidence: 0.9, reasoning: 'Strategic fundraising goal.', risk_notes: [], followup_options: [] })

    await orcDecisionGate('Help me prepare for my investor meeting', context)

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const requestBody = JSON.parse(fetchCall[1]?.body as string)
    const userMessage = requestBody.messages.find((m: any) => m.role === 'user')
    expect(userMessage.content).toContain('Raising Series A by Q4 2026')
  })

  it('includes recent conversation history in classifier prompt', async () => {
    mockLLMResponse({ mode: 'quick_plan', confidence: 0.85, reasoning: 'Follow-up to previous context.', risk_notes: [], followup_options: [] })

    const history = [
      { role: 'user', content: 'What should I focus on this week?' },
      { role: 'assistant', content: 'I recommend focusing on the Series A prep.' },
    ]
    await orcDecisionGate('Okay, help me with the pitch deck', emptyContext, history)

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const requestBody = JSON.parse(fetchCall[1]?.body as string)
    const userMessage = requestBody.messages.find((m: any) => m.role === 'user')
    expect(userMessage.content).toContain('RECENT CONVERSATION:')
    expect(userMessage.content).toContain('Series A prep')
  })
})
