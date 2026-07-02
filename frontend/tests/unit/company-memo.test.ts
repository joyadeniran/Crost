/**
 * Unit tests: lib/company-memo.ts — memo CRUD helpers + formatCompanyMemoSummary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initializeCompanyMemo,
  updateCompanyProfile,
  addArtifactReference,
  addTaskLog,
  logDecision,
  addStrategy,
  updateDepartmentNotes,
  getCompanyMemo,
  formatCompanyMemoSummary,
  type CompanyMemo,
} from '@/lib/company-memo'

const baseMemo: CompanyMemo = {
  id: 'memo-1',
  user_id: 'user-1',
  company_profile: { name: null, industry: null, location: null, description: null },
  active_goals: [],
  strategies: [],
  task_logs: [],
  artefact_references: [],
  decisions: [],
  department_notes: {},
  updated_by: null,
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
}

/** Chainable mock supabase client covering select/insert/update paths used by company-memo.ts */
function makeSupabase({
  existingMemo = null as CompanyMemo | null,
  insertResult = { data: baseMemo, error: null } as any,
  updateResult = { data: baseMemo, error: null } as any,
} = {}) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: existingMemo, error: null })),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    single: vi.fn(() => {
      // Distinguish insert vs update path by which was called most recently
      return Promise.resolve(builder.__lastOp === 'update' ? updateResult : insertResult)
    }),
  }
  const origInsert = builder.insert
  const origUpdate = builder.update
  builder.insert = vi.fn((...args: any[]) => {
    builder.__lastOp = 'insert'
    return origInsert(...args)
  })
  builder.update = vi.fn((...args: any[]) => {
    builder.__lastOp = 'update'
    return origUpdate(...args)
  })
  return { from: vi.fn(() => builder), builder }
}

describe('initializeCompanyMemo', () => {
  it('returns the existing memo if one exists', async () => {
    const supabase = makeSupabase({ existingMemo: baseMemo })
    const result = await initializeCompanyMemo(supabase, 'user-1')
    expect(result).toEqual(baseMemo)
    expect(supabase.builder.insert).not.toHaveBeenCalled()
  })

  it('creates a new memo with default empty structure when none exists', async () => {
    const supabase = makeSupabase({ existingMemo: null, insertResult: { data: baseMemo, error: null } })
    const result = await initializeCompanyMemo(supabase, 'user-1')
    expect(result).toEqual(baseMemo)
    expect(supabase.builder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        active_goals: [],
        strategies: [],
        task_logs: [],
        artefact_references: [],
        decisions: [],
        department_notes: {},
      }),
    )
  })

  it('returns null and logs when insert fails', async () => {
    const supabase = makeSupabase({ existingMemo: null, insertResult: { data: null, error: { message: 'boom' } } })
    const result = await initializeCompanyMemo(supabase, 'user-1')
    expect(result).toBeNull()
  })
})

describe('updateCompanyProfile', () => {
  it('merges the partial profile into the existing profile', async () => {
    const withProfile = { ...baseMemo, company_profile: { ...baseMemo.company_profile, name: 'Acme' } }
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: withProfile, error: null } })
    const result = await updateCompanyProfile(supabase, 'user-1', { name: 'Acme' })
    expect(result?.company_profile.name).toBe('Acme')
  })

  it('returns null when the memo cannot be initialized', async () => {
    const supabase = makeSupabase({ existingMemo: null, insertResult: { data: null, error: { message: 'fail' } } })
    const result = await updateCompanyProfile(supabase, 'user-1', { name: 'X' })
    expect(result).toBeNull()
  })

  it('returns null when the update itself fails', async () => {
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: null, error: { message: 'fail' } } })
    const result = await updateCompanyProfile(supabase, 'user-1', { name: 'X' })
    expect(result).toBeNull()
  })
})

describe('addArtifactReference / addTaskLog / logDecision / addStrategy / updateDepartmentNotes', () => {
  it('addArtifactReference appends the artifact id', async () => {
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: { ...baseMemo, artefact_references: ['a-1'] }, error: null } })
    const result = await addArtifactReference(supabase, 'user-1', 'a-1')
    expect(result?.artefact_references).toEqual(['a-1'])
  })

  it('addTaskLog appends the task log entry', async () => {
    const entry = { id: 't-1', goal_id: 'g-1', dept_slug: 'sales', title: 'x', status: 'completed' as const, result: null, artifact_id: null, created_at: new Date().toISOString() }
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: { ...baseMemo, task_logs: [entry] }, error: null } })
    const result = await addTaskLog(supabase, 'user-1', entry)
    expect(result?.task_logs).toEqual([entry])
  })

  it('logDecision appends the decision entry', async () => {
    const decision = { id: 'd-1', title: 't', context: 'c', decision: 'd', reasoning: 'r', made_by: 'founder' as const, created_at: new Date().toISOString() }
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: { ...baseMemo, decisions: [decision] }, error: null } })
    const result = await logDecision(supabase, 'user-1', decision)
    expect(result?.decisions).toEqual([decision])
  })

  it('addStrategy appends the strategy entry', async () => {
    const strategy = { id: 's-1', goal_id: 'g-1', title: 't', description: 'd', steps: [], status: 'proposed' as const, created_at: new Date().toISOString() }
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: { ...baseMemo, strategies: [strategy] }, error: null } })
    const result = await addStrategy(supabase, 'user-1', strategy)
    expect(result?.strategies).toEqual([strategy])
  })

  it('updateDepartmentNotes merges notes under the department slug key', async () => {
    const supabase = makeSupabase({ existingMemo: baseMemo, updateResult: { data: { ...baseMemo, department_notes: { sales: 'notes' } }, error: null } })
    const result = await updateDepartmentNotes(supabase, 'user-1', 'sales', 'notes')
    expect(result?.department_notes).toEqual({ sales: 'notes' })
  })

  it('all setters return null when initializeCompanyMemo returns null', async () => {
    const supabase = makeSupabase({ existingMemo: null, insertResult: { data: null, error: { message: 'fail' } } })
    expect(await addArtifactReference(supabase, 'user-1', 'a-1')).toBeNull()
    expect(await updateDepartmentNotes(supabase, 'user-1', 'sales', 'x')).toBeNull()
  })
})

describe('getCompanyMemo', () => {
  it('returns the memo when found', async () => {
    const supabase = makeSupabase({ existingMemo: baseMemo })
    const result = await getCompanyMemo(supabase, 'user-1')
    expect(result).toEqual(baseMemo)
  })

  it('returns null when no memo exists (data is null, no error)', async () => {
    const supabase = makeSupabase({ existingMemo: null })
    const result = await getCompanyMemo(supabase, 'user-1')
    expect(result).toBeNull()
  })

  it('returns null and logs when the query errors', async () => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: { message: 'db error' } })),
    }
    const supabase = { from: vi.fn(() => builder) }
    const result = await getCompanyMemo(supabase, 'user-1')
    expect(result).toBeNull()
  })
})

describe('formatCompanyMemoSummary', () => {
  it('shows "Not set" placeholders for an empty profile', () => {
    const summary = formatCompanyMemoSummary(baseMemo)
    expect(summary).toContain('Name: Not set')
    expect(summary).toContain('No active goals')
    expect(summary).toContain('No task logs')
    expect(summary).toContain('No artifacts')
    expect(summary).toContain('No department notes')
  })

  it('includes populated fields and counts', () => {
    const memo: CompanyMemo = {
      ...baseMemo,
      company_profile: { name: 'Acme', industry: 'SaaS', location: 'NYC', description: 'desc' },
      active_goals: [{ id: 'g1', title: 'Ship v2', description: '', status: 'in_progress', created_at: '', updated_at: '' }],
      task_logs: [{ id: 't1', goal_id: 'g1', dept_slug: 'eng', title: 'Build API', status: 'completed', result: null, artifact_id: null, created_at: '' }],
      artefact_references: ['a1', 'a2'],
      department_notes: { sales: 'x'.repeat(150) },
    }
    const summary = formatCompanyMemoSummary(memo)
    expect(summary).toContain('Name: Acme')
    expect(summary).toContain('[in_progress] Ship v2')
    expect(summary).toContain('[completed] Build API')
    expect(summary).toContain('2 artifacts created')
    expect(summary).toContain('**sales**:')
  })

  it('caps recent tasks display to 5 entries', () => {
    const memo: CompanyMemo = {
      ...baseMemo,
      task_logs: Array.from({ length: 8 }, (_, i) => ({
        id: `t${i}`, goal_id: 'g1', dept_slug: 'eng', title: `Task ${i}`, status: 'completed' as const, result: null, artifact_id: null, created_at: '',
      })),
    }
    const summary = formatCompanyMemoSummary(memo)
    expect(summary).toContain('Task 0')
    expect(summary).toContain('Task 4')
    expect(summary).not.toContain('Task 5')
  })
})
