// lib/llm-client.ts
// The ONLY file that communicates with the LLM/LiteLLM layer.
// Refactored to use LiteLLM as the primary proxy for all model calls.
// Server-side ONLY — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'
import { getModelForTask } from './model-routing'
import { resolveApiKey } from './key-resolver'
import { logUsage } from './usage-logger'
import type {
  Department,
  OrchestratorPlan,
  OrchestratorTask,
  WorkerTask,
  WorkerResult,
  WorkerDept,
} from '@/types'
import { truncateString, cleanLargePayload, formatMemoBody } from './utils'

// ─── Config ───────────────────────────────────────────────────────────────────

// Default models - names must match litellm config.yaml model_list entries
export const CLOUD_MODEL = process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile'
const CLOUD_MODEL_WORKER = process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile'

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000'
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || process.env.LITELLM_KEY

export async function getModel(
  taskType: 'planning' | 'execution' | 'analysis' | 'summarization',
  userId?: string | null
): Promise<{ model: string; provider?: string }> {
  const roleMap: Record<string, string> = {
    planning: 'orc_planning',
    execution: 'tool_execution',
    analysis: 'analysis',
    summarization: 'synthesis'
  }
  const role = roleMap[taskType] || 'tool_execution'

  if (userId) {
    try {
      return await getModelForTask(userId, role)
    } catch (err) {
      console.warn(`[llm-client] Failed to fetch model for role ${role}, using fallback`)
    }
  }

  const MODELS: Record<string, string> = {
    planning: process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile',
    execution: process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile',
    analysis: process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile',
    summarization: process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile'
  }
  const model = MODELS[taskType] || MODELS.execution
  return { model, provider: model.split('/')[0] }
}

// Default fallback tone when local_identity not yet set
const DEFAULT_LOCAL_IDENTITY = `Write professionally and clearly. Be direct, warm, and human.
Avoid corporate buzzwords. Adapt tone to context: technical when needed, conversational when appropriate.`

// ─── Approval signal regex ────────────────────────────────────────────────────

const APPROVAL_SIGNAL_MARKER = 'REQUEST_APPROVAL'
const APPROVAL_REGEX = /REQUEST_APPROVAL:?[\s\S]*?(\{[\s\S]*?\})/

/**
 * Standalone storage helper to offload large worker products to Supabase Storage.
 */
async function uploadArtifact(goalId: string | null, taskId: string, content: string): Promise<string | null> {
  const supabase = createServerSupabaseClient()
  const fileName = `${goalId || 'global'}/${taskId}_${Date.now()}.txt`
  
  try {
    const { data, error } = await supabase.storage
      .from('artifacts')
      .upload(fileName, content, {
        contentType: 'text/plain',
        upsert: true
      })
    
    if (error) throw error
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    return `${supabaseUrl}/storage/v1/object/public/artifacts/${data.path}`
  } catch (err) {
    console.error('[uploadArtifact] Failed:', err)
    return null
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export async function buildFinalPrompt(
  departmentPrompt: string,
  task: string,
  capabilities: string[] = [],
  restrictions: string[] = [],
  departmentSlug?: string,
  goalId?: string
): Promise<string> {
  const supabase = createServerSupabaseClient()

  let userId: string | null = null
  if (goalId) {
    const { data: goal } = await supabase.from('goals').select('created_by').eq('id', goalId).single()
    userId = goal?.created_by || null
  }

  const { data: constitutionRow } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'agent_constitution')
    .is('created_by', null)
    .single()

  const constitution = constitutionRow?.value
    ? String(constitutionRow.value).replace(/^"|"$/g, '')
    : ''

  let localIdentity = DEFAULT_LOCAL_IDENTITY
  if (userId) {
    const { data: identityRow } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'local_identity')
      .eq('created_by', userId)
      .maybeSingle()

    if (identityRow?.value && identityRow.value !== 'null') {
      localIdentity = String(identityRow.value).replace(/^"|"$/g, '')
    }
  }

  let memoBrief = departmentSlug ? await getMemoBrief(departmentSlug) : ''
  if (goalId) {
    const goalMemos = await getMemos(goalId)
    if (goalMemos) {
      memoBrief = memoBrief ? `${memoBrief}\n\n${goalMemos}` : goalMemos
    }
  }

  const capLine = capabilities.length > 0
    ? `CAPABILITIES\n${capabilities.map(c => `- ${c}`).join('\n')}`
    : ''
  const restLine = restrictions.length > 0
    ? `RESTRICTIONS\n${restrictions.map(r => `- ${r}`).join('\n')}`
    : ''

  const toolsQuery = supabase
    .from('available_tools')
    .select('id, label, description')
    .eq('is_configured', true)

  if (userId) {
    toolsQuery.eq('user_id', userId)
  } else {
    toolsQuery.is('user_id', null)
  }

  toolsQuery.or('is_action.eq.true,requires_config.eq.false,id.eq.supabase_query')
  const { data: tools } = await toolsQuery

  const toolDefinitions = [
    `### INTERNAL TOOLS (Always Available)`,
    `- COMPANY_MEMOS: Fetch recent company communications. Args: { "limit": number }`,
    `- SUPABASE_QUERY: Execute read-only SQL queries against the database schema. Args: { "query": "SELECT ..." }`,
    ...(tools ?? []).map(t => `- ${t.id.toUpperCase()}: ${t.description}`)
  ].join('\n')

  return [
    `## CROST CONSTITUTION (Non-negotiable)\n${constitution}`,
    `## YOUR ROLE\n${departmentPrompt}`,
    `## LOCAL IDENTITY\n${localIdentity}`,
    (capLine || restLine) ? `## CAPABILITY BOUNDARIES\n${[capLine, restLine].filter(Boolean).join('\n\n')}` : '',
    `## AVAILABLE TOOLS\n${toolDefinitions}`,
    memoBrief ? `## COMPANY MEMOS (recent, high priority)\n<trusted_internal_memos>\n${memoBrief}\n</trusted_internal_memos>` : '',
    `## TASK\n${task}`,
  ].filter(Boolean).join('\n\n---\n\n')
}

// ─── Approval request parser ──────────────────────────────────────────────────

export interface ApprovalRequest {
  action_type: string
  action_label: string
  reasoning: string
  payload: Record<string, unknown>
  context: string
}

export function parseApprovalRequest(response: string): ApprovalRequest | null | 'BLOCKED' {
  const hasSignal = response.includes(APPROVAL_SIGNAL_MARKER)
  const match = response.match(APPROVAL_REGEX)

  if (hasSignal && !match) {
    if (response.includes('\nREQUEST_APPROVAL') || response.startsWith('REQUEST_APPROVAL')) {
      return 'BLOCKED'
    }
    return null
  }
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1]) as Partial<ApprovalRequest>
    if (!parsed.reasoning || parsed.reasoning.trim() === '' || !parsed.action_type || !parsed.action_label) {
      return null
    }

    return {
      action_type: parsed.action_type,
      action_label: parsed.action_label,
      reasoning: parsed.reasoning,
      payload: parsed.payload ?? {},
      context: parsed.context ?? '',
    }
  } catch {
    return 'BLOCKED'
  }
}

// ─── Context Compiler ─────────────────────────────────────────────────────────

export async function buildOrcContext(userId: string | null): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()

    const { data: tier1Memos } = await supabase
      .from('company_memos')
      .select('title, body, from_department, priority, is_foundational, is_current_context')
      .or('is_foundational.eq.true,is_current_context.eq.true')
      .order('created_at', { ascending: true })

    const { data: criticalMemos } = await supabase
      .from('company_memos')
      .select('title, body, from_department, priority, confidence, source_type')
      .eq('priority', 'urgent')
      .eq('is_foundational', false)
      .eq('is_current_context', false)
      .order('created_at', { ascending: false })
      .limit(10)

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: highMemos } = await supabase
      .from('company_memos')
      .select('title, body, from_department, priority, confidence, source_type')
      .eq('priority', 'high')
      .eq('is_foundational', false)
      .eq('is_current_context', false)
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(8)

    const { data: optionalMemos } = await supabase
      .from('company_memos')
      .select('title, from_department, priority')
      .in('priority', ['normal', 'low'])
      .eq('is_foundational', false)
      .eq('is_current_context', false)
      .order('created_at', { ascending: false })
      .limit(5)

    const sections: string[] = []

    if (tier1Memos && tier1Memos.length > 0) {
      const formatted = tier1Memos
        .map(m => `[${(m as any).is_foundational ? 'FOUNDATIONAL' : 'CURRENT CONTEXT'}] ${m.title} (from: ${m.from_department})\n${m.body}`)
        .join('\n\n')
      sections.push(`### CORE BUSINESS CONTEXT\n${formatted}`)
    }

    if (criticalMemos && criticalMemos.length > 0) {
      const tier2 = criticalMemos
        .map(m => `[URGENT] ${m.title} (from: ${m.from_department})\n${m.body}`)
        .join('\n\n')
      sections.push(`### CRITICAL MEMOS\n${tier2}`)
    }

    if (highMemos && highMemos.length > 0) {
      const tier3 = highMemos
        .map(m => `[HIGH] ${m.title} (from: ${m.from_department})\n${m.body.slice(0, 500)}`)
        .join('\n\n')
      sections.push(`### HIGH-PRIORITY MEMOS\n${tier3}`)
    }

    if (optionalMemos && optionalMemos.length > 0) {
      const tier4 = optionalMemos
        .map(m => `- [${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})`)
        .join('\n')
      sections.push(`### RECENT MEMOS (Summary Only)\n${tier4}`)
    }

    return sections.join('\n\n')
  } catch {
    return ''
  }
}

// ─── Memo brief ───────────────────────────────────────────────────────────────

async function getMemoBrief(departmentSlug: string): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()

    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department')
      .in('priority', ['high', 'urgent'])
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .not('read_by', 'cs', `{${departmentSlug}}`)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!memos || memos.length === 0) return ''

    return memos
      .map(m => `[${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})\n${m.priority === 'urgent' ? m.body : m.body.slice(0, 500)}`)
      .join('\n\n')
  } catch {
    return ''
  }
}

async function getMemos(goalId: string, lastN: number = 10): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()

    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department')
      .eq('goal_id', goalId)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(lastN)

    if (!memos || memos.length === 0) return ''

    return memos
      .map(m => `[GOAL MEMO][${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})\n${m.body.slice(0, 800)}`)
      .join('\n\n')
  } catch {
    return ''
  }
}

async function saveContextMemo(goalId: string, content: string, userId: string | null) {
  const supabase = createServerSupabaseClient()
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 7)

  try {
    await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'founder',
      title: 'Founder Context (Clarification)',
      body: content,
      priority: 'high',
      source_type: 'founder',
      confidence: 1.0,
      valid_until: validUntil.toISOString(),
      is_current_context: true,
      version_tag: `v_${Date.now()}`,
      created_by: userId
    })
  } catch (err) {
    console.error('[saveContextMemo] Failed:', err)
  }
}

// ─── LiteLLM Integration ─────────────────────────────────────────────────────

async function callLiteLLM(
  model: string,
  prompt: string,
  systemNote?: string,
  userId?: string | null,
  providerOverride?: string,
  isBootstrap?: boolean
): Promise<{ content: string; tokensUsed: number }> {
  const modelName = model

  // Derive provider from model name prefix (e.g. 'groq/llama-3.3-70b-versatile' → 'groq')
  // providerOverride takes precedence when explicitly supplied by the caller
  const provider = providerOverride ?? modelName.split('/')[0]

  // ── Key resolution: exactly ONE key per request ───────────────────────────
  // User BYOK if valid, else system key. Never both simultaneously.
  const { apiKey, keyType } = await resolveApiKey({ userId, provider, isBootstrap })

  // ── Token budget check (system-key calls from authenticated users only) ───
  // Bootstrap calls are exempt. User-key calls are always exempt.
  if (keyType === 'system' && !isBootstrap && userId) {
    const budget = await checkTokenBudget(userId)
    if (!budget.allowed) {
      throw new Error(JSON.stringify({
        code: 'SYSTEM_LIMIT_EXCEEDED',
        tokensUsed: budget.tokensUsed,
        limit: budget.limit,
        resetAt: budget.resetAt,
        message: 'Free usage limit reached. Please add your API key to continue or wait till your limit resets.',
      }))
    }
  }

  const messages: any[] = []
  if (systemNote) {
    messages.push({ role: 'system', content: systemNote })
  }
  messages.push({ role: 'user', content: prompt })

  const body: any = {
    model: modelName,
    messages,
    temperature: 0.3,
  }

  // Pass user's own API key to LiteLLM for key-passthrough mode.
  // RULE: body.api_key ONLY — never extra_body.api_key.
  if (apiKey) {
    body.api_key = apiKey
  }

  const res = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LITELLM_MASTER_KEY && { 'Authorization': `Bearer ${LITELLM_MASTER_KEY}` })
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`LiteLLM error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const promptTokens     = data.usage?.prompt_tokens     ?? 0
  const completionTokens = data.usage?.completion_tokens ?? 0
  const totalTokens      = data.usage?.total_tokens      ?? 0

  // Fire-and-forget usage log — skipped silently when userId is null
  if (userId) {
    logUsage({
      userId,
      model: modelName,
      provider,
      keyType,
      promptTokens,
      completionTokens,
      totalTokens,
    }).catch(() => {}) // logUsage never rethrows, but be safe
  }

  return {
    content: data.choices?.[0]?.message?.content ?? '',
    tokensUsed: totalTokens,
  }
}

export async function callLLM(
  model: string,
  prompt: string,
  systemNote?: string,
  userId?: string | null,
  providerOverride?: string,
  isBootstrap?: boolean
): Promise<{ content: string; tokensUsed: number }> {
  return callLiteLLM(model, prompt, systemNote, userId, providerOverride, isBootstrap)
}

// ─── Token budget check (per-user, per-day) ──────────────────────────────────

export async function checkTokenBudget(userId: string): Promise<
  | { allowed: true }
  | { allowed: false; tokensUsed: number; limit: number; resetAt: string }
> {
  try {
    const supabase = createServerSupabaseClient()
    const limit = Number(process.env.FREE_SYSTEM_DAILY_TOKENS ?? '50000')

    // First-goal exemption: if the user has never used a system key, allow unrestricted
    const { count: lifetimeCount } = await supabase
      .from('api_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('key_type', 'system')

    if ((lifetimeCount ?? 0) === 0) {
      return { allowed: true } // First goal — exempt from daily limit
    }

    // Per-user per-day system token usage (resets at midnight UTC)
    const todayMidnightUTC = new Date()
    todayMidnightUTC.setUTCHours(0, 0, 0, 0)

    const { data: usage } = await supabase
      .from('api_usage_logs')
      .select('total_tokens')
      .eq('user_id', userId)
      .eq('key_type', 'system')
      .gte('created_at', todayMidnightUTC.toISOString())

    const tokensUsed = (usage ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0)

    if (tokensUsed >= limit) {
      // Reset time: next midnight UTC
      const resetAt = new Date(todayMidnightUTC)
      resetAt.setUTCDate(resetAt.getUTCDate() + 1)
      return { allowed: false, tokensUsed, limit, resetAt: resetAt.toISOString() }
    }

    return { allowed: true }
  } catch {
    return { allowed: true } // Fail open — never block on budget check errors
  }
}

// ─── Event Logger ─────────────────────────────────────────────────────────────

interface LogEventInput {
  event_type: string
  department_slug?: string | null
  goal_id?: string | null
  description: string
  tokens_used?: number
  model_used?: string | null
  metadata?: Record<string, unknown>
  created_by?: string | null
}

export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()
    let departmentId: string | null = null
    if (input.department_slug && input.department_slug !== 'orchestrator') {
      const { data } = await supabase.from('departments').select('id').eq('slug', input.department_slug).single()
      departmentId = data?.id ?? null
    }

    await supabase.from('event_log').insert({
      department_id: departmentId,
      department_slug: input.department_slug ?? null,
      goal_id: input.goal_id ?? null,
      event_type: input.event_type,
      description: truncateString(input.description, 200),
      tokens_used: input.tokens_used ?? 0,
      model_used: input.model_used ?? null,
      metadata: cleanLargePayload(input.metadata ?? {}),
      created_by: input.created_by ?? null
    })
  } catch (err) {
    console.error('[logEvent] Failed to write event:', err)
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const ORCHESTRATOR_SYSTEM_NOTE = `You are a JSON-only orchestration engine. You MUST respond with valid JSON matching this exact schema — no prose, no markdown fences, no commentary before or after:

{
  "is_valid_goal": boolean,
  "clarification_question": "string or null",
  "plan": {
    "goal": "string",
    "risk_note": "string — mandatory one-sentence risk assessment",
    "data_gathered": { "dept_slug": "string" },
    "tasks": [
      {
        "id": "uuid string",
        "dept": "department slug string",
        "action": "snake_case_action_string",
        "label": "Human readable label",
        "reasoning": "Mandatory non-empty explanation of why this task is needed",
        "expected_deliverable": "Specific outcome this task must produce",
        "params": {},
        "risk_level": "low | medium | high | critical",
        "model": "cloud",
        "depends_on": []
      }
    ]
  }
}

Rules: 
1. if is_valid_goal is true, plan must be fully populated. If is_valid_goal is false, clarification_question must be non-empty. reasoning on every task is mandatory.
2. You MUST ONLY assign tasks to the PROVIDED list of departments.
3. CENTRALIZED RESEARCH: Insert a "Master Research Task" at the start for any market/external data needs.
4. BRAIN VS. TOOL: Use tools ONLY for data the LLM cannot know. Use Brain for strategy/creative.`

function parseOrchestratorResponse(raw: string): any {
  let jsonStr = raw.trim()
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.is_valid_goal === undefined && parsed.plan) parsed.is_valid_goal = true
    
    if (parsed.is_valid_goal && parsed.plan?.tasks) {
      for (const t of parsed.plan.tasks) {
        t.id = crypto.randomUUID()
        // Normalize legacy/invalid model aliases to 'cloud' sentinel so
        // runWorkerTask resolves them via user_model_assignments at runtime
        const isLegacyAlias = !t.model
          || t.model.startsWith('cloud/')
          || t.model.startsWith('local/')
        if (isLegacyAlias) t.model = 'cloud'
      }
    }
    return { ok: true, ...parsed }
  } catch {
    return { ok: false, reason: 'JSON parse failed' }
  }
}

export async function runOrchestratorTask(
  founderInput: string,
  goalId: string,
  conversationHistory: any[] = [],
  forcePlan: boolean = false
): Promise<any> {
  const supabase = createServerSupabaseClient()
  const [{ data: orcDept }, { data: goalRow }] = await Promise.all([
    supabase.from('departments').select('*').eq('is_orchestrator', true).single(),
    supabase.from('goals').select('created_by').eq('id', goalId).single()
  ])

  const userId = goalRow?.created_by
  const lastMsg = conversationHistory[conversationHistory.length - 1]
  if (lastMsg && lastMsg.role === 'user') {
    await saveContextMemo(goalId, lastMsg.content, userId)
  }

  const { data: allActiveDepts } = await supabase
    .from('departments')
    .select('id, name, slug, status, current_task')
    .eq('activation_stage', 'active')
    .neq('is_orchestrator', true)

  const activeDeptsList = allActiveDepts ?? []
  const systemMemory = await buildOrcContext(userId)

  const prompt = `GOAL: ${founderInput}\n\nAvailable Departments: ${activeDeptsList.map(d => d.slug).join(', ')}\n\nSystem Memory:\n${systemMemory}`

  const finalPrompt = await buildFinalPrompt(
    orcDept?.persona_prompt ?? 'You are the Orchestrator.',
    prompt,
    orcDept?.capabilities ?? [],
    orcDept?.restrictions ?? [],
    orcDept?.slug,
    goalId
  )

  const { model: planModel, provider: planProvider } = await getModel('planning', userId)
  const { content, tokensUsed } = await callLLM(planModel, finalPrompt, ORCHESTRATOR_SYSTEM_NOTE, userId, planProvider)
  const result = parseOrchestratorResponse(content)
  
  if (!result.ok) throw new Error(result.reason)

  if (result.is_valid_goal === false) {
    const updatedHistory = [...conversationHistory, { role: 'assistant', content: result.clarification_question, ts: new Date().toISOString() }]
    await supabase.from('goals').update({ status: 'clarifying', orc_conversation: updatedHistory }).eq('id', goalId)
    return result
  }

  const { plan } = result
  await supabase.from('goals').update({ orchestrator_plan: plan, risk_note: plan.risk_note, status: 'awaiting_approval' }).eq('id', goalId)

  await supabase.from('goal_tasks').delete().eq('goal_id', goalId).in('status', ['pending', 'planned', 'awaiting_approval'])

  if (plan.tasks.length > 0) {
    // Determine default model for tasks if not specified in plan
    const { model: execModel } = await getModel('execution', userId)

    const taskRows = plan.tasks.map((t: any) => ({
      goal_id: goalId,
      task_id: t.id,
      created_by: userId,
      dept_slug: t.dept,
      action: t.action,
      label: t.label,
      reasoning: t.reasoning,
      expected_deliverable: t.expected_deliverable,
      params: t.params,
      risk_level: t.risk_level,
      depends_on: t.depends_on,
      model: t.model === 'cloud' ? execModel : (t.model || execModel),
      status: 'pending',
    }))
    await supabase.from('goal_tasks').insert(taskRows)
  }

  await logEvent({
    event_type: 'plan_drafted',
    department_slug: 'orchestrator',
    goal_id: goalId,
    description: `Plan drafted — ${plan.tasks.length} tasks.`,
    tokens_used: tokensUsed,
    created_by: userId
  })

  return result
}

// ─── Worker task execution ────────────────────────────────────────────────────

export async function runWorkerTask(
  dept: WorkerDept,
  task: WorkerTask,
  goalId?: string,
  envModeOverride?: 'local' | 'cloud'
): Promise<WorkerResult> {
  const supabase = createServerSupabaseClient()
  const [{ data: deptRow }, { data: goalRow }] = await Promise.all([
    supabase.from('departments').select('*').eq('slug', dept).single(),
    goalId ? supabase.from('goals').select('created_by').eq('id', goalId).single() : Promise.resolve({ data: null })
  ])

  if (!deptRow) throw new Error(`Department "${dept}" not found`)
  const userId = goalRow?.created_by || deptRow.created_by

  await supabase.from('departments').update({ status: 'running', current_task: task.label }).eq('id', deptRow.id)

  const taskPrompt = `Execute precisely and output JSON.\n\nTASK:\nID: ${task.id}\nAction: ${task.action}\nLabel: ${task.label}\nReasoning: ${task.reasoning}\nExpected Deliverable: ${task.expected_deliverable}\nParams: ${JSON.stringify(task.params)}\n\nResponse MUST be JSON.`

  const finalPrompt = await buildFinalPrompt(
    deptRow.persona_prompt,
    taskPrompt,
    deptRow.capabilities ?? [],
    deptRow.restrictions ?? [],
    deptRow.slug,
    goalId
  )

  let modelName = task.model
  // Resolve 'cloud'/'local' sentinels AND any legacy cloud/* or local/* aliases
  // that may have been stored before the model naming was standardised
  const isUnresolvedAlias = !modelName
    || modelName === 'cloud'
    || modelName === 'local'
    || modelName.startsWith('cloud/')
    || modelName.startsWith('local/')
  if (isUnresolvedAlias) {
    const { model: execModel } = await getModel('execution', userId)
    modelName = execModel
  }

  const { content, tokensUsed } = await callLLM(modelName, finalPrompt, undefined, userId)

  const approvalRequest = parseApprovalRequest(content)
  if (approvalRequest === 'BLOCKED') throw new Error('APPROVAL_PARSE_BLOCKED')
  if (approvalRequest) {
    await supabase.from('approval_queue').insert({
      department_id: deptRow.id,
      department_name: deptRow.name,
      department_slug: dept,
      action_type: approvalRequest.action_type,
      action_label: approvalRequest.action_label,
      reasoning: approvalRequest.reasoning,
      payload: { ...approvalRequest.payload, __task_id: task.id },
      context: approvalRequest.context,
      risk_level: 'medium',
      goal_id: goalId ?? null,
      status: 'pending',
      created_by: userId
    })
    await supabase.from('departments').update({ status: 'awaiting_approval' }).eq('id', deptRow.id)
    return { task_id: task.id, status: 'needs_approval', result: {}, memo_summary: '', errors: [] }
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  let workerResult: WorkerResult = { task_id: task.id, status: 'completed', result: { raw: content }, memo_summary: content.slice(0, 200), errors: [] }

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      workerResult.status = parsed.needs_more_data ? 'needs_data' : 'completed'
      workerResult.result = parsed
      workerResult.memo_summary = parsed.summary || content.slice(0, 500)
    } catch (e) { console.error('Worker JSON parse fail', e) }
  }

  // Artefact Logic: If content is large or explicitly requested, save as artifact
  let artifactUrl: string | null = null
  if (content.length > 1000) {
    artifactUrl = await uploadArtifact(goalId || null, task.id, content)
    if (artifactUrl) {
      await supabase.from('artifacts').insert({
        goal_id: goalId || null,
        created_by: userId,
        department_slug: dept,
        department_id: deptRow.id,
        artifact_type: 'document',
        title: `Output: ${task.label}`,
        file_url: artifactUrl,
        metadata: { task_id: task.id, action: task.action }
      })
    }
  }

  await supabase.from('company_memos').insert({
    goal_id: goalId || null,
    task_id: task.id,
    from_department: deptRow.name,
    from_department_id: deptRow.id,
    title: `[${task.action}] ${task.label}`,
    body: formatMemoBody(workerResult.memo_summary + (artifactUrl ? `\n\nFull output saved as artifact: ${artifactUrl}` : '')),
    tags: [task.action, dept],
    confidence: 0.8,
    source_type: 'agent',
    created_by: userId
  })

  await supabase.from('goal_tasks').update({ status: workerResult.status, completed_at: new Date().toISOString() }).eq('task_id', task.id)
  await supabase.from('departments').update({ status: 'idle', current_task: null }).eq('id', deptRow.id)

  // Chain Reaction: If this goal is now finished, trigger the synthesis report
  if (goalId) {
    const { data: allTasks } = await supabase.from('goal_tasks').select('status').eq('goal_id', goalId)
    const terminalStatuses = new Set(['completed', 'failed', 'rejected', 'expired'])
    const allTerminal = (allTasks || []).every(t => terminalStatuses.has(t.status))
    if (allTerminal) {
      await runOrcReport(goalId)
    }
  }

  return workerResult
}

// ─── Orc Synthesis Report ───────────────────────────────────────────────────

export async function runOrcReport(goalId: string): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
  if (!goal) return

  // Idempotency: skip if report already exists
  const { data: existingReport } = await supabase.from('company_memos').select('id').eq('goal_id', goalId).ilike('title', '[ORC REPORT]%').maybeSingle()
  if (existingReport) return

  const { data: memos } = await supabase.from('company_memos').select('*').eq('goal_id', goalId)
  if (!memos || memos.length === 0) return

  const context = memos.map(m => `### [${m.from_department}] ${m.title}\n${m.body}`).join('\n\n')
  const prompt = `Goal: ${goal.founder_input}\n\nFindings:\n${context}\n\nSynthesize into a strategic report.`

  try {
    const { model: reportModel } = await getModel('summarization', goal.created_by)
    const { content } = await callLLM(reportModel, prompt, "You are the Orc Chief of Staff. Synthesize results.", goal.created_by)
    await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'Orchestrator',
      title: `[ORC REPORT] ${goal.title}`,
      body: formatMemoBody(content),
      priority: 'high',
      source_type: 'orchestrator',
      created_by: goal.created_by
    })
  } catch (err) {
    console.error('[runOrcReport] Failed:', err)
  }
}
