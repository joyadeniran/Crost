/**
 * Unit tests: lib/engine/orchestrator.ts — runOrcReport (Phase 5, spec §7).
 * First real behavioral coverage of this function — the pre-existing
 * tests/unit/goals-report.test.ts mocks runOrcReport entirely (it tests the
 * route calling it, not the function itself).
 *
 * Covers the two spec-drift fixes made this session:
 *  - "Mission Reports are written for successful, failed, and
 *    partial-completion missions" — previously bailed out silently when
 *    there were no company_memos rows for the goal.
 *  - "Every Mission Report includes a Sources section listing every Memo
 *    entry, KB file, and tool call referenced during the mission" —
 *    previously never built at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let mockGoal: any = null
let mockMemos: any[] = []
let mockGoalTasks: any[] = []
let mockArtifacts: any[] = []
const insertedMemos: any[] = []
const generateActionsMock = vi.fn(() => Promise.resolve([]))
const logEventMock = vi.fn(() => Promise.resolve())
const logDecisionMock = vi.fn(() => Promise.resolve())
const callLLMMock = vi.fn(() => Promise.resolve({ content: 'LLM-generated debrief body' }))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'goals') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: mockGoal, error: null })) })) })) }
      }
      if (table === 'company_memos') {
        const builder: any = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          or: vi.fn(() => builder),
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })), // no existing report — not idempotency-skipped
          insert: vi.fn((row: any) => {
            insertedMemos.push(row)
            return { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'report-1' }, error: null })) })) }
          }),
        }
        // First .eq() chain is for company_memos SELECT (existingReport / memos fetch);
        // handled generically since both just resolve via maybeSingle/await.
        builder.then = (resolve: any) => resolve({ data: mockMemos, error: null })
        return builder
      }
      if (table === 'goal_tasks') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: mockGoalTasks, error: null })) })) }
      }
      if (table === 'artifacts') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: mockArtifacts, error: null })) })) }
      }
      return { select: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: [], error: null })) })) }
    }),
  })),
}))

vi.mock('@/lib/engine/model', () => ({
  getModel: vi.fn(() => Promise.resolve({ model: 'test-model' })),
  callLLM: (...args: any[]) => callLLMMock(...args),
}))

vi.mock('@/lib/engine/events', () => ({
  logEvent: (...args: any[]) => logEventMock(...args),
}))

vi.mock('@/lib/company-memo', () => ({
  logDecision: (...args: any[]) => logDecisionMock(...args),
}))

vi.mock('@/lib/suggested-actions', () => ({
  generateAndInsertSuggestedActions: (...args: any[]) => generateActionsMock(...args),
}))

vi.mock('@/lib/log', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { runOrcReport } from '@/lib/engine/orchestrator'

beforeEach(() => {
  mockGoal = { id: 'goal-1', title: 'Test Mission', founder_input: 'Do the thing', created_by: 'user-1' }
  mockMemos = []
  mockGoalTasks = []
  mockArtifacts = []
  insertedMemos.length = 0
  generateActionsMock.mockClear()
  logEventMock.mockClear()
  logDecisionMock.mockClear()
  callLLMMock.mockClear()
})

describe('runOrcReport — no-memo fallback (spec §7 failed-mission requirement)', () => {
  it('still writes a Mission Report when there are zero memos, instead of bailing out silently', async () => {
    mockMemos = []
    mockGoalTasks = [
      { label: 'Draft pitch deck', dept_slug: 'marketing', status: 'failed' },
      { label: 'Send follow-up', dept_slug: 'sales', status: 'rejected' },
    ]
    await runOrcReport('goal-1')
    expect(insertedMemos.length).toBe(1)
    expect(insertedMemos[0].body).toContain('Draft pitch deck')
    expect(insertedMemos[0].body).toContain('failed')
    expect(callLLMMock).not.toHaveBeenCalled() // no data to summarize — deterministic body, no LLM call
  })

  it('includes a Sources section even in the no-memo fallback, explicitly noting none exist', async () => {
    mockMemos = []
    mockGoalTasks = []
    await runOrcReport('goal-1')
    expect(insertedMemos[0].body).toContain('## Sources')
  })

  it('still generates suggested actions and emits the completion event for a no-memo report', async () => {
    mockMemos = []
    await runOrcReport('goal-1')
    expect(generateActionsMock).toHaveBeenCalled()
    expect(logEventMock).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'goal_mission_report_written' }))
  })
})

describe('runOrcReport — Sources section (spec §7)', () => {
  it('appends a Sources section listing memo entries, KB files, and tool calls when memos exist', async () => {
    mockMemos = [{ from_department: 'marketing', title: 'Pitch deck research', body: 'findings...' }]
    mockArtifacts = [
      { sources: { kb_file_ids: ['kb-1', 'kb-2'], tool_calls: [{ service: 'gmail', action: 'send_email' }] } },
    ]
    await runOrcReport('goal-1')
    const body = insertedMemos[0].body
    expect(body).toContain('LLM-generated debrief body')
    expect(body).toContain('## Sources')
    expect(body).toContain('[marketing] Pitch deck research')
    expect(body).toContain('kb-1')
    expect(body).toContain('kb-2')
    expect(body).toContain('gmail.send_email')
  })

  it('shows "none" for KB files and tool calls when no artifacts reference any', async () => {
    mockMemos = [{ from_department: 'marketing', title: 'Notes', body: 'x' }]
    mockArtifacts = []
    await runOrcReport('goal-1')
    const body = insertedMemos[0].body
    expect(body).toContain('**Knowledge Base files:** none')
    expect(body).toContain('**Tool calls:** none')
  })

  it('dedupes repeated tool calls across multiple artifacts', async () => {
    mockMemos = [{ from_department: 'sales', title: 'Notes', body: 'x' }]
    mockArtifacts = [
      { sources: { kb_file_ids: [], tool_calls: [{ service: 'gmail', action: 'send_email' }] } },
      { sources: { kb_file_ids: [], tool_calls: [{ service: 'gmail', action: 'send_email' }] } },
    ]
    await runOrcReport('goal-1')
    const body = insertedMemos[0].body
    const occurrences = (body.match(/gmail\.send_email/g) || []).length
    expect(occurrences).toBe(1)
  })
})
