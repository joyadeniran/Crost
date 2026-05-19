import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildPrepChecklist,
  getUpcomingEvents,
  getProactivePrepSuggestions,
  type CalendarEvent,
} from '@/lib/calendar-prep'

// ─── Supabase mock ────────────────────────────────────────────────────────────

function makeChain(terminal: () => Promise<any>) {
  const chain: any = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.lte = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
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
  supabaseFromImpl = (_table) => makeChain(async () => ({ data: [], error: null }))
})

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    user_id: 'user-1',
    type: 'investor_meeting',
    title: 'Accel Partner Call',
    date: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    attendees: [],
    prep_required: [],
    related_goals: [],
    next_actions: [],
    source: 'manual',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ─── buildPrepChecklist ───────────────────────────────────────────────────────

describe('buildPrepChecklist', () => {
  it('returns checklist items for investor_meeting', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'investor_meeting' }))
    expect(checklist.length).toBeGreaterThanOrEqual(3)
    const labels = checklist.map(i => i.label)
    expect(labels.some(l => /pitch deck/i.test(l))).toBe(true)
    expect(labels.some(l => /metrics/i.test(l))).toBe(true)
  })

  it('returns checklist items for board_meeting', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'board_meeting' }))
    const labels = checklist.map(i => i.label)
    expect(labels.some(l => /board deck/i.test(l))).toBe(true)
    expect(labels.some(l => /financial/i.test(l))).toBe(true)
  })

  it('returns checklist items for customer_call', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'customer_call' }))
    const labels = checklist.map(i => i.label)
    expect(labels.some(l => /customer/i.test(l) || /account/i.test(l))).toBe(true)
  })

  it('returns checklist items for conference', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'conference' }))
    expect(checklist.length).toBeGreaterThan(0)
  })

  it('returns checklist items for deadline', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'deadline' }))
    const priorities = checklist.map(i => i.priority)
    expect(priorities).toContain('high')
  })

  it('returns fallback items for other type', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'other' }))
    expect(checklist.length).toBeGreaterThan(0)
  })

  it('merges event-specific prep_required into checklist (no duplicates)', () => {
    const event = makeEvent({
      type: 'investor_meeting',
      prep_required: ['Custom demo video', 'Update pitch deck with latest metrics'],
    })
    const checklist = buildPrepChecklist(event)
    // 'Custom demo video' should be added (not in base template)
    expect(checklist.some(i => i.label === 'Custom demo video')).toBe(true)
    // 'Update pitch deck with latest metrics' is already in template — should not duplicate
    const pitchCount = checklist.filter(i => /pitch deck/i.test(i.label)).length
    expect(pitchCount).toBe(1)
  })

  it('includes goalPrompt for actionable items', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'investor_meeting' }))
    const withPrompt = checklist.filter(i => i.goalPrompt)
    expect(withPrompt.length).toBeGreaterThan(0)
    withPrompt.forEach(i => expect(typeof i.goalPrompt).toBe('string'))
  })

  it('assigns priority values from the set high/medium/low', () => {
    const checklist = buildPrepChecklist(makeEvent({ type: 'board_meeting' }))
    checklist.forEach(i => {
      expect(['high', 'medium', 'low']).toContain(i.priority)
    })
  })
})

// ─── getUpcomingEvents ────────────────────────────────────────────────────────

describe('getUpcomingEvents', () => {
  it('returns events from the DB', async () => {
    const fakeEvent = makeEvent()
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: [fakeEvent], error: null }))

    const result = await getUpcomingEvents('user-1')
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('evt-1')
  })

  it('returns [] on DB error', async () => {
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: null, error: { message: 'db error' } }))
    const result = await getUpcomingEvents('user-1')
    expect(result).toEqual([])
  })

  it('returns [] when supabase throws', async () => {
    supabaseFromImpl = () => { throw new Error('boom') }
    const result = await getUpcomingEvents('user-1')
    expect(result).toEqual([])
  })

  it('passes correct look-ahead window to query', async () => {
    const capturedArgs: string[] = []
    supabaseFromImpl = (_table) => {
      const chain: any = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.gte = (_col: string, val: string) => { capturedArgs.push(`gte:${val}`); return chain }
      chain.lte = (_col: string, val: string) => { capturedArgs.push(`lte:${val}`); return chain }
      chain.order = () => chain
      chain.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve)
      return chain
    }

    const before = Date.now()
    await getUpcomingEvents('user-1', 14)

    const lteArg = capturedArgs.find(a => a.startsWith('lte:'))
    expect(lteArg).toBeTruthy()
    const lteDate = new Date(lteArg!.slice(4))
    const expectedMax = new Date(before + 14 * 86_400_000)
    // Within 1 second tolerance
    expect(Math.abs(lteDate.getTime() - expectedMax.getTime())).toBeLessThan(1000)
  })
})

// ─── getProactivePrepSuggestions ──────────────────────────────────────────────

describe('getProactivePrepSuggestions', () => {
  it('returns suggestions with daysUntil computed from event date', async () => {
    const threeDaysFromNow = new Date(Date.now() + 3 * 86_400_000).toISOString()
    const event = makeEvent({ date: threeDaysFromNow })
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: [event], error: null }))

    const suggestions = await getProactivePrepSuggestions('user-1')
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].daysUntil).toBeGreaterThanOrEqual(2)
    expect(suggestions[0].daysUntil).toBeLessThanOrEqual(4)
  })

  it('returns daysUntil=0 for overdue events (clamped by Math.max)', async () => {
    // Past events return msUntil < 0 → clamped to 0 by Math.max
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const event = makeEvent({ date: yesterday })
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: [event], error: null }))

    const suggestions = await getProactivePrepSuggestions('user-1')
    expect(suggestions[0].daysUntil).toBe(0)
  })

  it('includes a non-empty checklist for each suggestion', async () => {
    const event = makeEvent({ type: 'board_meeting' })
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: [event], error: null }))

    const suggestions = await getProactivePrepSuggestions('user-1')
    expect(suggestions[0].checklist.length).toBeGreaterThan(0)
  })

  it('returns [] when no upcoming events exist', async () => {
    supabaseFromImpl = (_table) => makeChain(async () => ({ data: [], error: null }))
    const suggestions = await getProactivePrepSuggestions('user-1')
    expect(suggestions).toEqual([])
  })
})
