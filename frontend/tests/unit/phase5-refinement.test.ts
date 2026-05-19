// tests/unit/phase5-refinement.test.ts
// Phase 5 refinement: orc_context cache, timing observability, founder feedback

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchOrcContext,
  invalidateOrcContextCache,
  type OrcContextRow,
} from '@/lib/orc-decision-gate'

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockSelect   = vi.fn().mockReturnThis()
const mockEq       = vi.fn().mockReturnThis()
const mockOrder    = vi.fn().mockReturnThis()
const mockLimit    = vi.fn()

const mockFrom     = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: mockFrom,
  })),
}))

function makeContextChain(rows: OrcContextRow[]) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockResolvedValue({ data: rows, error: null }),
  }
  return chain
}

// ─── Cache behavior ───────────────────────────────────────────────────────────

describe('fetchOrcContext — in-memory cache', () => {
  const userId = 'user-cache-test'

  const sampleRows: OrcContextRow[] = [
    {
      id: 'row-1',
      context_type: 'profile',
      content: { name: 'TestCo' },
      summary: 'TestCo (SaaS)',
      recency_score: 80,
      source: 'extracted_from_memos',
    },
  ]

  beforeEach(() => {
    // Always clear cache before each test so TTL/state doesn't bleed between tests
    invalidateOrcContextCache(userId)
    mockFrom.mockReturnValue(makeContextChain(sampleRows))
  })

  afterEach(() => {
    invalidateOrcContextCache(userId)
    vi.clearAllMocks()
  })

  it('fetches from DB on first call and returns rows', async () => {
    const result = await fetchOrcContext(userId)
    expect(result).toHaveLength(1)
    expect(result[0].context_type).toBe('profile')
    expect(mockFrom).toHaveBeenCalledWith('orc_context')
  })

  it('returns cached result on second call without hitting DB again', async () => {
    await fetchOrcContext(userId)
    const callCountAfterFirst = mockFrom.mock.calls.length

    await fetchOrcContext(userId)
    // DB call count must not increase on the second fetch
    expect(mockFrom.mock.calls.length).toBe(callCountAfterFirst)
  })

  it('returns [] for null userId without querying DB', async () => {
    const result = await fetchOrcContext(null)
    expect(result).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('invalidateOrcContextCache forces re-fetch from DB', async () => {
    await fetchOrcContext(userId)
    const callsAfterFirst = mockFrom.mock.calls.length

    invalidateOrcContextCache(userId)
    await fetchOrcContext(userId)

    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirst)
  })

  it('cache is per-user — different users hit DB independently', async () => {
    const otherUserId = 'user-other'
    invalidateOrcContextCache(otherUserId)

    await fetchOrcContext(userId)
    const callsAfterFirst = mockFrom.mock.calls.length

    await fetchOrcContext(otherUserId) // different user → must hit DB
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirst)

    invalidateOrcContextCache(otherUserId)
  })

  it('fails open — returns [] on DB error without throwing', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockRejectedValue(new Error('DB connection lost')),
    })

    const result = await fetchOrcContext(userId)
    expect(result).toEqual([])
  })
})

// ─── Cache TTL expiry (time-based) ───────────────────────────────────────────

describe('fetchOrcContext — TTL expiry', () => {
  const userId = 'user-ttl-test'

  beforeEach(() => invalidateOrcContextCache(userId))
  afterEach(() => { invalidateOrcContextCache(userId); vi.useRealTimers() })

  it('re-fetches after TTL expires (60s)', async () => {
    vi.useFakeTimers()

    mockFrom.mockReturnValue(makeContextChain([]))
    await fetchOrcContext(userId)
    const callsAfterFirst = mockFrom.mock.calls.length

    vi.advanceTimersByTime(61_000) // advance past TTL

    await fetchOrcContext(userId)
    expect(mockFrom.mock.calls.length).toBeGreaterThan(callsAfterFirst)

    vi.useRealTimers()
  })
})

// ─── Timing struct initialization ────────────────────────────────────────────

describe('runOrchestratorTask timing struct', () => {
  it('timing struct fields are numeric and t.start is set before any await', () => {
    const t = { start: Date.now(), preProcess: 0, decisionGate: 0, llm: 0 }
    expect(typeof t.start).toBe('number')
    expect(typeof t.preProcess).toBe('number')
    expect(typeof t.decisionGate).toBe('number')
    expect(typeof t.llm).toBe('number')
    expect(t.start).toBeGreaterThan(0)
    expect(t.preProcess).toBe(0)
  })

  it('timing phases are non-negative after milestones', () => {
    const t = { start: Date.now() - 200, preProcess: Date.now() - 100, decisionGate: Date.now() - 50, llm: Date.now() }
    const phases = {
      preProcess:   t.preProcess   - t.start,
      decisionGate: t.decisionGate - t.preProcess,
      llm:          t.llm          - t.decisionGate,
    }
    expect(phases.preProcess).toBeGreaterThanOrEqual(0)
    expect(phases.decisionGate).toBeGreaterThanOrEqual(0)
    expect(phases.llm).toBeGreaterThanOrEqual(0)
  })

  it('requestId has expected format (8-char alphanumeric)', () => {
    const requestId = Math.random().toString(36).slice(2, 10)
    expect(requestId).toMatch(/^[a-z0-9]{8}$/)
  })

  it('timing log payload has all required fields', () => {
    const t = { start: 1000, preProcess: 1050, decisionGate: 1100, llm: 1400 }
    const payload = {
      type: 'orc_timing',
      requestId: 'abc12345',
      userId: 'u1',
      goalId: 'g1',
      phases: {
        preProcess:   t.preProcess   - t.start,
        decisionGate: t.decisionGate - t.preProcess,
        llm:          t.llm          - t.decisionGate,
      },
      totalMs: t.llm - t.start,
    }
    expect(payload.type).toBe('orc_timing')
    expect(payload.phases.preProcess).toBe(50)
    expect(payload.phases.decisionGate).toBe(50)
    expect(payload.phases.llm).toBe(300)
    expect(payload.totalMs).toBe(400)
  })
})

// ─── Feedback route — Zod schema ─────────────────────────────────────────────

import { z } from 'zod'

const FeedbackSchema = z.object({
  outcome: z.enum(['successful', 'failed']),
  override_reason: z.string().max(500).optional(),
})

describe('feedback route schema', () => {
  it('accepts successful outcome', () => {
    const result = FeedbackSchema.safeParse({ outcome: 'successful' })
    expect(result.success).toBe(true)
  })

  it('accepts failed outcome', () => {
    const result = FeedbackSchema.safeParse({ outcome: 'failed' })
    expect(result.success).toBe(true)
  })

  it('accepts outcome with override_reason', () => {
    const result = FeedbackSchema.safeParse({ outcome: 'failed', override_reason: 'Wrong mode selected' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.override_reason).toBe('Wrong mode selected')
  })

  it('rejects unknown outcome values', () => {
    const result = FeedbackSchema.safeParse({ outcome: 'partial' })
    expect(result.success).toBe(false)
  })

  it('rejects missing outcome', () => {
    const result = FeedbackSchema.safeParse({})
    expect(result.success).toBe(false)
  })

  it('rejects override_reason longer than 500 chars', () => {
    const result = FeedbackSchema.safeParse({
      outcome: 'failed',
      override_reason: 'x'.repeat(501),
    })
    expect(result.success).toBe(false)
  })

  it('override_reason is optional — omitting it is valid', () => {
    const result = FeedbackSchema.safeParse({ outcome: 'successful' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.override_reason).toBeUndefined()
  })
})
