// Company Memo Utilities
// Per CROST_SPEC Section 5: Company Memo is single source of truth for company state
// This module provides typed helpers for reading/writing structured memo data

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any

/**
 * Structured Company Memo per CROST_SPEC Section 5
 */
export interface CompanyMemo {
  id: string
  user_id: string
  company_profile: {
    name: string | null
    industry: string | null
    location: string | null
    description: string | null
  }
  active_goals: GoalEntry[]
  strategies: StrategyEntry[]
  task_logs: TaskLogEntry[]
  artefact_references: string[] // UUIDs of artifacts
  decisions: DecisionEntry[]
  department_notes: Record<string, string> // dept_slug → notes
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface GoalEntry {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  created_at: string
  updated_at: string
}

export interface StrategyEntry {
  id: string
  goal_id: string
  title: string
  description: string
  steps: string[]
  status: 'proposed' | 'approved' | 'executing' | 'completed'
  created_at: string
}

export interface TaskLogEntry {
  id: string
  goal_id: string
  dept_slug: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result: string | null
  artifact_id: string | null
  created_at: string
}

export interface DecisionEntry {
  id: string
  title: string
  context: string
  decision: string
  reasoning: string
  made_by: 'founder' | 'orc' | 'department'
  created_at: string
}

/**
 * Initialize or get the company memo for a user
 */
export async function initializeCompanyMemo(
  supabase: SupabaseClient,
  userId: string
): Promise<CompanyMemo | null> {
  // Try to get existing memo
  const { data: existing } = await supabase
    .from('company_memo')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return existing as CompanyMemo

  // Create new memo
  const { data: newMemo, error } = await supabase
    .from('company_memo')
    .insert({
      user_id: userId,
      company_profile: {
        name: null,
        industry: null,
        location: null,
        description: null
      },
      active_goals: [],
      strategies: [],
      task_logs: [],
      artefact_references: [],
      decisions: [],
      department_notes: {}
    })
    .select()
    .single()

  if (error) {
    console.error('[Initialize Company Memo Error]', error)
    return null
  }

  return newMemo as CompanyMemo
}

/**
 * Update company profile section
 */
export async function updateCompanyProfile(
  supabase: SupabaseClient,
  userId: string,
  profile: Partial<CompanyMemo['company_profile']>
): Promise<CompanyMemo | null> {
  const memo = await initializeCompanyMemo(supabase, userId)
  if (!memo) return null

  const { data, error } = await supabase
    .from('company_memo')
    .update({
      company_profile: { ...memo.company_profile, ...profile },
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[Update Company Profile Error]', error)
    return null
  }

  return data as CompanyMemo
}

/**
 * Add artifact reference to memo
 */
export async function addArtifactReference(
  supabase: SupabaseClient,
  userId: string,
  artifactId: string
): Promise<CompanyMemo | null> {
  const memo = await initializeCompanyMemo(supabase, userId)
  if (!memo) return null

  const updated = [...(memo.artefact_references || []), artifactId]

  const { data, error } = await supabase
    .from('company_memo')
    .update({
      artefact_references: updated,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[Add Artifact Reference Error]', error)
    return null
  }

  return data as CompanyMemo
}

/**
 * Add task log entry
 */
export async function addTaskLog(
  supabase: SupabaseClient,
  userId: string,
  entry: TaskLogEntry
): Promise<CompanyMemo | null> {
  const memo = await initializeCompanyMemo(supabase, userId)
  if (!memo) return null

  const updated = [...(memo.task_logs || []), entry]

  const { data, error } = await supabase
    .from('company_memo')
    .update({
      task_logs: updated,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[Add Task Log Error]', error)
    return null
  }

  return data as CompanyMemo
  }

  /**
  * Add a decision entry
  */
  export async function logDecision(
  supabase: SupabaseClient,
  userId: string,
  decision: DecisionEntry
  ): Promise<CompanyMemo | null> {
  const memo = await initializeCompanyMemo(supabase, userId)
  if (!memo) return null

  const updated = [...(memo.decisions || []), decision]

  const { data, error } = await supabase
    .from('company_memo')
    .update({
      decisions: updated,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[Log Decision Error]', error)
    return null
  }

  return data as CompanyMemo
  }

  /**
  * Add a strategy entry
  */
  export async function addStrategy(
  supabase: SupabaseClient,
  userId: string,
  strategy: StrategyEntry
  ): Promise<CompanyMemo | null> {
  const memo = await initializeCompanyMemo(supabase, userId)
  if (!memo) return null

  const updated = [...(memo.strategies || []), strategy]

  const { data, error } = await supabase
    .from('company_memo')
    .update({
      strategies: updated,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[Add Strategy Error]', error)
    return null
  }

  return data as CompanyMemo
  }

  /**
  * Get department notes
  */
export async function updateDepartmentNotes(
  supabase: SupabaseClient,
  userId: string,
  deptSlug: string,
  notes: string
): Promise<CompanyMemo | null> {
  const memo = await initializeCompanyMemo(supabase, userId)
  if (!memo) return null

  const { data, error } = await supabase
    .from('company_memo')
    .update({
      department_notes: {
        ...memo.department_notes,
        [deptSlug]: notes
      },
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[Update Department Notes Error]', error)
    return null
  }

  return data as CompanyMemo
}

/**
 * Get the company memo
 */
export async function getCompanyMemo(
  supabase: SupabaseClient,
  userId: string
): Promise<CompanyMemo | null> {
  const { data, error } = await supabase
    .from('company_memo')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[Get Company Memo Error]', error)
    return null
  }

  if (!data) return null

  return data as CompanyMemo
}

/**
 * Get memo summary for display (human-readable format)
 */
export function formatCompanyMemoSummary(memo: CompanyMemo): string {
  const lines: string[] = [
    '## Company Memo Summary',
    '',
    '### Company Profile',
    `- Name: ${memo.company_profile.name || 'Not set'}`,
    `- Industry: ${memo.company_profile.industry || 'Not set'}`,
    `- Location: ${memo.company_profile.location || 'Not set'}`,
    `- Description: ${memo.company_profile.description || 'Not set'}`,
    '',
    '### Active Goals',
    memo.active_goals.length > 0
      ? memo.active_goals.map(g => `- [${g.status}] ${g.title}`).join('\n')
      : '- No active goals',
    '',
    '### Recent Tasks',
    memo.task_logs.length > 0
      ? memo.task_logs.slice(0, 5).map(t => `- [${t.status}] ${t.title}`).join('\n')
      : '- No task logs',
    '',
    '### Artifacts',
    memo.artefact_references.length > 0
      ? `- ${memo.artefact_references.length} artifacts created`
      : '- No artifacts',
    '',
    '### Department Notes',
    Object.entries(memo.department_notes).length > 0
      ? Object.entries(memo.department_notes)
        .map(([dept, notes]) => `- **${dept}**: ${notes.substring(0, 100)}...`)
        .join('\n')
      : '- No department notes',
    '',
    `Last updated: ${new Date(memo.updated_at).toLocaleString()}`
  ]

  return lines.join('\n')
}
