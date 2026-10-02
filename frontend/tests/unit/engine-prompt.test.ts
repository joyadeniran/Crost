/**
 * Unit tests: lib/engine/prompt.ts — buildFinalPrompt artifact context injection.
 *
 * Root-cause fix for the "self-destructive flow": prior task outputs
 * (artifacts) were never injected into subsequent task prompts, so
 * departments declared needs_more_data for work already produced in the
 * same goal.
 *
 * Contract:
 *  - When the goal has artifacts, buildFinalPrompt includes a
 *    "PRIOR TASK OUTPUTS" section with each artifact's title and a body excerpt.
 *  - Discarded/deprecated artifacts are excluded.
 *  - When the goal has no artifacts, the section is absent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Chainable Supabase mock ────────────────────────────────────────────────

let artifactRows: any[] = []
let eqCalls: Array<[string, string, unknown]> = []
let structuredMemoRow: any = null

function makeBuilder(table: string) {
  const builder: any = {
    _table: table,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(function (this: any, col: string, val: unknown) { eqCalls.push([table, col, val]); return this }),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(async () => {
      if (table === 'goals') {
        return { data: { id: 'goal-1', created_by: 'user-1' }, error: null }
      }
      if (table === 'system_config') {
        return { data: { value: 'Constitution text' }, error: null }
      }
      return { data: null, error: null }
    }),
    maybeSingle: vi.fn().mockImplementation(async () => ({ data: table === 'company_memo' ? structuredMemoRow : null, error: null })),
    then: vi.fn().mockImplementation(function (this: any, resolve: any) {
      const data = table === 'artifacts' ? artifactRows : []
      return Promise.resolve({ data, error: null }).then(resolve)
    }),
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => makeBuilder(table)),
  })),
}))

vi.mock('@/lib/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { buildFinalPrompt, buildOrcContext } from '@/lib/engine/prompt'

describe('buildFinalPrompt — prior task artifact context', () => {
  beforeEach(() => {
    artifactRows = []
  })

  it('injects a PRIOR TASK OUTPUTS section when the goal has artifacts', async () => {
    artifactRows = [
      {
        id: 'art-1',
        title: 'Output: Draft pitch deck',
        artifact_type: 'document',
        department_slug: 'marketing',
        status: 'draft',
        body: '{"slides":[{"title":"Vision","content":"Company OS for founders"}]}',
        file_url: 'artifacts/goal-1/art-1.docx',
        task_id: 'task-1',
        created_at: '2026-07-01T00:00:00Z',
      },
    ]

    const prompt = await buildFinalPrompt(
      'You are the Sales department.',
      'Refine the pitch deck with financial projections.',
      [],
      [],
      'sales',
      'goal-1'
    )

    expect(prompt).toContain('PRIOR TASK OUTPUTS')
    expect(prompt).toContain('Output: Draft pitch deck')
    expect(prompt).toContain('Company OS for founders')
    // The section must instruct the model to use these instead of blocking
    expect(prompt.toLowerCase()).toContain('needs_more_data')
  })

  it('excludes discarded and deprecated artifacts', async () => {
    artifactRows = [
      {
        id: 'art-2',
        title: 'Output: Old draft',
        artifact_type: 'document',
        department_slug: 'marketing',
        status: 'discarded',
        body: 'obsolete content',
        file_url: null,
        task_id: 'task-0',
        created_at: '2026-06-01T00:00:00Z',
      },
      {
        id: 'art-3',
        title: 'Output: Deprecated plan',
        artifact_type: 'document',
        department_slug: 'marketing',
        status: 'deprecated',
        body: 'deprecated content',
        file_url: null,
        task_id: 'task-0b',
        created_at: '2026-06-02T00:00:00Z',
      },
    ]

    const prompt = await buildFinalPrompt('Persona', 'Task', [], [], 'sales', 'goal-1')

    expect(prompt).not.toContain('Output: Old draft')
    expect(prompt).not.toContain('Output: Deprecated plan')
    expect(prompt).not.toContain('PRIOR TASK OUTPUTS')
  })

  it('omits the section when the goal has no artifacts', async () => {
    artifactRows = []
    const prompt = await buildFinalPrompt('Persona', 'Task', [], [], 'sales', 'goal-1')
    expect(prompt).not.toContain('PRIOR TASK OUTPUTS')
  })

  it('omits the section when no goalId is provided', async () => {
    artifactRows = [
      {
        id: 'art-4',
        title: 'Output: Should not appear',
        artifact_type: 'document',
        department_slug: 'marketing',
        status: 'draft',
        body: 'content',
        file_url: null,
        task_id: 'task-9',
        created_at: '2026-07-01T00:00:00Z',
      },
    ]
    const prompt = await buildFinalPrompt('Persona', 'Task', [], [], 'sales')
    expect(prompt).not.toContain('PRIOR TASK OUTPUTS')
  })
})


describe('buildOrcContext — ownership scoping and legacy-data resilience', () => {
  beforeEach(() => {
    eqCalls = []
    structuredMemoRow = null
  })

  it('returns empty context (and queries nothing) when there is no user', async () => {
    expect(await buildOrcContext(null)).toBe('')
    expect(eqCalls).toEqual([])
  })

  it('scopes every company_memos query to the owner', async () => {
    await buildOrcContext('user-1')
    const memoScopes = eqCalls.filter(([t, c]) => t === 'company_memos' && c === 'created_by')
    expect(memoScopes).toHaveLength(4)
    expect(memoScopes.every(([, , v]) => v === 'user-1')).toBe(true)
  })

  it('does not throw when migrated jsonb columns are not arrays', async () => {
    structuredMemoRow = {
      company_profile: { name: 'Acme' },
      decisions: { not: 'an array' },
      task_logs: null,
    }
    const ctx = await buildOrcContext('user-1')
    expect(ctx).toContain('COMPANY PROFILE: Acme')
  })
})
