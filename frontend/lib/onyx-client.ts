// lib/onyx-client.ts
// The ONLY file that communicates with the LLM/Onyx layer.
// Constitution is always position 1 — mirrors Anthropic's safety-first prompt engineering.
// Server-side ONLY — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'
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

// llama-3.3-70b-versatile: 128k context, better instruction following than llama3-70b-8192
export const CLOUD_MODEL = process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile'
const CLOUD_MODEL_WORKER = process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile'
export function getModel(taskType: 'planning' | 'execution' | 'analysis' | 'summarization'): string {
  const MODELS: Record<string, string> = {
    planning: process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile',
    execution: process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile',
    analysis: process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile',
    summarization: process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile'
  }
  return MODELS[taskType] || MODELS.execution
}

// Default fallback tone when local_identity not yet set
const DEFAULT_LOCAL_IDENTITY = `Write professionally and clearly. Be direct, warm, and human.
Avoid corporate buzzwords. Adapt tone to context: technical when needed, conversational when appropriate.`

// ─── Approval signal regex ────────────────────────────────────────────────────

// SAFETY RULE: if the string "REQUEST_APPROVAL" appears in a response but the
// regex fails to parse valid JSON, we treat it as a BLOCKED request — never
// silently proceed past a failed safety gate.
const APPROVAL_SIGNAL_MARKER = 'REQUEST_APPROVAL'

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
const APPROVAL_REGEX = /REQUEST_APPROVAL:?[\s\S]*?(\{[\s\S]*?\})/

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Assembles the final prompt in the non-negotiable order:
 * 1. Constitution  2. Persona  3. Local Identity  4. Capabilities  5. Memo Brief  6. Task
 */
export async function buildFinalPrompt(
  departmentPrompt: string,
  task: string,
  capabilities: string[] = [],
  restrictions: string[] = [],
  departmentSlug?: string,
  goalId?: string
): Promise<string> {
  const supabase = createServerSupabaseClient()

  // 1. Fetch Goal to find the owner (for multi-tenant context)
  let userId: string | null = null
  if (goalId) {
    const { data: goal } = await supabase.from('goals').select('created_by').eq('id', goalId).single()
    userId = goal?.created_by || null
  }

  // 2. Fetch Constitution (Global default)
  const { data: constitutionRow } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'agent_constitution')
    .is('created_by', null) // Global
    .single()

  const constitution = constitutionRow?.value
    ? String(constitutionRow.value).replace(/^"|"$/g, '')
    : ''

  // 3. Fetch Local Identity (Per-user preference)
  let localIdentity = DEFAULT_LOCAL_IDENTITY
  if (userId) {
    // Try user-specific config first
    const { data: identityRow } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'local_identity')
      .eq('created_by', userId)
      .maybeSingle()

    if (identityRow?.value && identityRow.value !== 'null') {
      localIdentity = String(identityRow.value).replace(/^"|"$/g, '')
    } else {
      // Fallback: check user metadata (if migration pending or used as primary)
      const { data: authUser } = await supabase.auth.admin.getUserById(userId)
      const meta = authUser?.user?.user_metadata?.local_identity
      if (meta) {
        localIdentity = typeof meta === 'string' ? meta : JSON.stringify(meta)
      }
    }
  }

  // Memo brief — always fresh, never cached
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

  // 4. Fetch Available Tools (Scoped to User)
  const toolsQuery = supabase
    .from('available_tools')
    .select('id, label, description')
    .eq('is_configured', true)

  if (userId) {
    toolsQuery.eq('user_id', userId)
  } else {
    toolsQuery.is('user_id', null)
  }

  // Filter out redundant high-level toolkit rows for the LLM
  // We want individual actions (is_action=true) and system tools (web_search, etc.)
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

/**
 * Parses a REQUEST_APPROVAL signal from an agent response.
 * Returns null if malformed or missing reasoning (auto-rejected per spec).
 */
export function parseApprovalRequest(response: string): ApprovalRequest | null | 'BLOCKED' {
  // SAFETY: if signal marker appears but JSON parse fails, return BLOCKED.
  // Never silently proceed past a failed approval gate.
  const hasSignal = response.includes(APPROVAL_SIGNAL_MARKER)
  const match = response.match(APPROVAL_REGEX)

  if (hasSignal && !match) {
    // If it looks like a false positive (e.g. just talking about approvals), don't block.
    // Only block if it's a dedicated line or clear intention.
    if (response.includes('\nREQUEST_APPROVAL') || response.startsWith('REQUEST_APPROVAL')) {
      console.warn('[parseApprovalRequest] SAFETY BLOCK: Dedicated REQUEST_APPROVAL marker found but JSON could not be extracted.')
      return 'BLOCKED'
    }
    return null
  }
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1]) as Partial<ApprovalRequest>

    // reasoning is MANDATORY — missing = auto-reject per 04_DECISIONS_LOG
    if (!parsed.reasoning || parsed.reasoning.trim() === '') {
      console.warn('[parseApprovalRequest] Rejected: missing reasoning field')
      return null
    }
    if (!parsed.action_type || !parsed.action_label) {
      console.warn('[parseApprovalRequest] Rejected: missing action_type or action_label')
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
    console.warn('[parseApprovalRequest] SAFETY BLOCK: JSON parse threw. Blocking execution.')
    return 'BLOCKED'
  }
}

// ─── Context Compiler ─────────────────────────────────────────────────────────

/**
 * Builds Orc context deterministically with tiered memo priority:
 *
 * TIER 1 — ALWAYS (foundational): is_foundational = true
 *   These are auto-generated from company_profile on onboarding.
 *   Always included. Never pruned. Full body always shown.
 *
 * TIER 2 — CRITICAL (urgent priority): priority = 'urgent', not foundational
 *   Always included. Full body shown.
 *
 * TIER 3 — CONDITIONAL (high priority, recent): priority = 'high', last 7 days
 *   Included if token budget allows. Body truncated to 500 chars.
 *
 * TIER 4 — OPTIONAL (normal/low, recent): everything else
 *   Summarized to title only. Max 5 items.
 */
export async function buildOrcContext(userId: string | null): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()

    // TIER 1: Foundational and Current Context memos
    const { data: tier1Memos } = await supabase
      .from('company_memos')
      .select('title, body, from_department, priority, is_foundational, is_current_context')
      .or('is_foundational.eq.true,is_current_context.eq.true')
      .order('created_at', { ascending: true })

    // TIER 2: Critical (urgent) non-context memos
    const { data: criticalMemos } = await supabase
      .from('company_memos')
      .select('title, body, from_department, priority, confidence, source_type')
      .eq('priority', 'urgent')
      .eq('is_foundational', false)
      .eq('is_current_context', false)
      .order('created_at', { ascending: false })
      .limit(10)

    // TIER 3: High-priority memos from last 7 days
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

    // TIER 4: Optional — recent normal/low memos
    const { data: optionalMemos } = await supabase
      .from('company_memos')
      .select('title, from_department, priority')
      .in('priority', ['normal', 'low'])
      .eq('is_foundational', false)
      .eq('is_current_context', false)
      .order('created_at', { ascending: false })
      .limit(5)

    const sections: string[] = []

    // Format TIER 1
    if (tier1Memos && tier1Memos.length > 0) {
      const formatted = tier1Memos
        .map(m => {
          const type = (m as any).is_foundational ? 'FOUNDATIONAL' : 'CURRENT CONTEXT'
          return `[${type}] ${m.title} (from: ${m.from_department})\n${m.body}`
        })
        .join('\n\n')
      sections.push(`### CORE BUSINESS CONTEXT\n${formatted}`)
    }

    // Format TIER 2
    if (criticalMemos && criticalMemos.length > 0) {
      const tier2 = criticalMemos
        .map(m => {
          const confidenceTag = m.confidence != null ? ` [confidence: ${m.confidence.toFixed(2)}]` : ''
          const sourceTag = m.source_type ? ` [source: ${m.source_type}]` : ''
          return `[URGENT${confidenceTag}${sourceTag}] ${m.title} (from: ${m.from_department})\n${m.body}`
        })
        .join('\n\n')
      sections.push(`### CRITICAL MEMOS (Urgent — Always Included)\n${tier2}`)
    }

    // Format TIER 3
    if (highMemos && highMemos.length > 0) {
      const tier3 = highMemos
        .map(m => {
          const confidenceTag = m.confidence != null ? ` [confidence: ${m.confidence.toFixed(2)}]` : ''
          const sourceTag = m.source_type ? ` [source: ${m.source_type}]` : ''
          const body = m.body.slice(0, 500)
          return `[HIGH${confidenceTag}${sourceTag}] ${m.title} (from: ${m.from_department})\n${body}`
        })
        .join('\n\n')
      sections.push(`### HIGH-PRIORITY MEMOS (Last 7 Days)\n${tier3}`)
    }

    // Format TIER 4
    if (optionalMemos && optionalMemos.length > 0) {
      const tier4 = optionalMemos
        .map(m => `- [${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})`)
        .join('\n')
      sections.push(`### RECENT MEMOS (Summary Only)\n${tier4}`)
    }

    if (sections.length === 0) return ''

    return sections.join('\n\n')
  } catch {
    return '' // non-fatal — context compiler must never crash the orchestrator
  }
}

// ─── Memo brief ───────────────────────────────────────────────────────────────

/**
 * Fetches unread high/urgent memos for a department.
 * Always fetches fresh — never cache. A memo written seconds ago must be visible.
 */
async function getMemoBrief(departmentSlug: string): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()

    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department, confidence, source_type, valid_until, version_tag')
      .in('priority', ['high', 'urgent'])
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .not('read_by', 'cs', `{${departmentSlug}}`)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!memos || memos.length === 0) return ''

    return memos
      .map(m => {
        // Urgent memos get full body — context must not be truncated for critical briefs
        const body = m.priority === 'urgent' ? m.body : m.body.slice(0, 500)
        const confidenceTag = m.confidence != null ? ` [confidence: ${m.confidence.toFixed(2)}]` : ''
        const sourceTag = m.source_type ? ` [source: ${m.source_type}]` : ''
        const versionTag = m.version_tag ? ` [version: ${m.version_tag}]` : ''
        return `[${m.priority.toUpperCase()}${confidenceTag}${sourceTag}${versionTag}] ${m.title} (from: ${m.from_department})\n${body}`
      })
      .join('\n\n')
  } catch {
    return '' // non-fatal
  }
}

async function getMemos(goalId: string, lastN: number = 10): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()

    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department, confidence, source_type, valid_until, version_tag')
      .eq('goal_id', goalId)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(lastN)

    if (!memos || memos.length === 0) return ''

    return memos
      .map(m => {
        const confidenceTag = m.confidence != null ? ` [confidence: ${m.confidence.toFixed(2)}]` : ''
        const sourceTag = m.source_type ? ` [source: ${m.source_type}]` : ''
        const versionTag = m.version_tag ? ` [version: ${m.version_tag}]` : ''
        
        // Truncate to prevent token limit crashes on workers (16k limit typically)
        const bodyContent = m.body.length > 800 ? m.body.slice(0, 800) + '... [body truncated for context size]' : m.body
        return `[GOAL MEMO][${m.priority.toUpperCase()}${confidenceTag}${sourceTag}${versionTag}] ${m.title} (from: ${m.from_department})\n${bodyContent}`
      })
      .join('\n\n')
  } catch {
    return ''
  }
}

/**
 * Saves a user response from the dialogue as a context memo.
 */
async function saveContextMemo(goalId: string, content: string, userId: string | null) {
  const supabase = createServerSupabaseClient()
  
  // Expiry: 7 days for user context (adjustable)
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

// ─── Direct LLM Providers ─────────────────────────────────────────────────────

async function callGroq(modelName: string, prompt: string, systemNote?: string): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  const messages = []
  if (systemNote) messages.push({ role: 'system', content: systemNote })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: modelName, messages, temperature: 0.3 }),
  })
  
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Groq API error ${res.status}: ${errText}`)
  }
  
  const data = await res.json()
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    tokensUsed: data.usage?.total_tokens ?? 0
  }
}

async function callGemini(modelName: string, prompt: string): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
    tokensUsed: data.usageMetadata?.totalTokenCount ?? 0
  }
}

export async function callLLM(
  model: string,
  prompt: string,
  systemNote?: string
): Promise<{ content: string; tokensUsed: number }> {
  // Cloud-only mode lock for MVP
  if (model === 'cloud' || model === 'local') {
    model = getModel('execution')
  }

  // Route to the correct provider REST API manually since LiteLLM isn't running
  if (model.startsWith('groq/')) {
    return callGroq(model.replace('groq/', ''), prompt, systemNote)
  }
  
  if (model.startsWith('gemini/') || model.startsWith('cloud/')) {
    const modelName = model
      .replace(/^gemini\//, '')
      .replace(/^cloud\/gemini-/, 'gemini-')
      .replace(/^cloud\//, '') || 'gemini-1.5-pro'
    return callGemini(modelName, prompt)
  }
  
  throw new Error(`Unsupported direct LLM model format: ${model}`)
}

// ─── Token budget check ─────────────────────────────────────────────────────

/**
 * Checks today's accumulated cloud token usage against the hard limit.
 * Returns an object: { allowed: true } or { allowed: false, tokensUsed, limit }.
 * Called before every cloud LLM call.
 */
export async function checkTokenBudget(): Promise<
  { allowed: true } | { allowed: false; tokensUsed: number; limit: number }
> {
  try {
    const supabase = createServerSupabaseClient()

    const [{ data: limitRow }, { data: usage }] = await Promise.all([
      supabase
        .from('system_config')
        .select('value')
        .eq('key', 'token_hard_limit_per_session')
        .single(),
      supabase
        .from('event_log')
        .select('tokens_used')
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .gt('tokens_used', 0),
    ])

    const limit = Number(limitRow?.value ?? 1000000)
    const tokensUsed = (usage ?? []).reduce((sum, row) => sum + (row.tokens_used ?? 0), 0)

    if (tokensUsed >= limit) {
      console.warn(`[checkTokenBudget] Hard limit reached: ${tokensUsed}/${limit} tokens today.`)
      return { allowed: false, tokensUsed, limit }
    }
    return { allowed: true }
  } catch {
    // Non-fatal — fail open so a budget check error doesn't block all tasks
    return { allowed: true }
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

/**
 * Writes to event_log. Never throws — always safe to call from any context.
 */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()

    let departmentId: string | null = null
    if (input.department_slug && input.department_slug !== 'orchestrator') {
      const { data } = await supabase
        .from('departments')
        .select('id')
        .eq('slug', input.department_slug)
        .single()
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
    // logEvent must never throw — log to console only
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
1. if is_valid_goal is true, plan must be fully populated. If is_valid_goal is false, clarification_question must be non-empty. reasoning on every task is mandatory. Omitting it makes the plan invalid.
2. You MUST ONLY assign tasks to the PROVIDED list of departments. NEVER hallucinate roles like CEO, CFO, or Customer Support unless they are in the JSON list provided below. If a task is needed but no suitable department exists, skip the task or assign it to the most relevant one from the list.
3. Each task must have: id (UUID), dept (slug), action, label, reasoning, params (JSON), risk_level (low|medium|high|critical), depends_on (array of IDs), model.
4. Provide a risk_note explaining potential downsides of the plan.
5. CENTRALIZED RESEARCH: If a goal requires general market data (e.g. "market trends", "competitor prices", "local regulations"), you MUST insert a single "Master Research Task" at the start of the plan. Assign it to the most relevant department (usually 'ops' or 'marketing'). All subsequent tasks that need this data MUST depend on this research task and explicitly state in their reasoning: "Read Memo from Research Task for data."
6. BRAIN VS. TOOL: Differentiate between internal knowledge and external data. Use tools ONLY for data the LLM cannot know (e.g. real-time stock prices, today's news, specific customer emails, private DB records). For general strategy or creative work, use the Brain.`

type ParseResult =
  | { ok: true; is_valid_goal: boolean; clarification_question?: string; plan?: OrchestratorPlan }
  | { ok: false; reason: string; rawPreview: string }

function parseOrchestratorResponse(raw: string): ParseResult {
  let jsonStr = raw.trim()
  
  // More robust JSON extraction: find the first { and the last }
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  }

  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // If it fails, try a slightly more aggressive cleanup: remove markdown code blocks
    try {
      const cleaner = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaner)
    } catch {
      const preview = raw.slice(0, 500)
      return { ok: false, reason: `JSON parse failed. Check if LLM added prose.`, rawPreview: preview }
    }
  }

  // Ensure is_valid_goal is present (default to true if plan exists, for backward compatibility)
  if (parsed.is_valid_goal === undefined && parsed.plan) {
    parsed.is_valid_goal = true
  }

  if (parsed.is_valid_goal === false) {
    if (!parsed.clarification_question) {
      return { ok: false, reason: 'clarification_question is missing for invalid goal', rawPreview: JSON.stringify(parsed).slice(0, 200) }
    }
    return { ok: true, is_valid_goal: false, clarification_question: parsed.clarification_question }
  }

  if (!parsed.plan || !parsed.plan.tasks || !Array.isArray(parsed.plan.tasks)) {
    return { ok: false, reason: 'plan or tasks array is missing', rawPreview: JSON.stringify(parsed).slice(0, 200) }
  }

  // Fix for empty tasks: common for "Set a goal" if it thinks it needs more info but didn't set is_valid_goal=false
  if (parsed.plan.tasks.length === 0 && !parsed.clarification_question) {
     return { ok: false, reason: 'Plan has no tasks. If you need more info, use is_valid_goal: false.', rawPreview: JSON.stringify(parsed).slice(0, 200) }
  }

  const validRisks = ['low', 'medium', 'high', 'critical']

  // UUID v4 regex for validation
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  for (const t of parsed.plan.tasks) {
    const rawTask = t as unknown as Record<string, any>
    // Robust field mapping for varying LLM outputs
    if (!t.dept) t.dept = (rawTask.dept_slug ?? rawTask.department ?? rawTask.worker ?? 'ops') as WorkerDept
    if (!t.action) t.action = String(rawTask.action_type ?? rawTask.type ?? 'research')
    if (!t.label) t.label = String(rawTask.title ?? rawTask.name ?? t.action)
    if (!t.reasoning) t.reasoning = String(rawTask.rationale ?? rawTask.reason ?? `Task for ${t.dept}`)
    if (!t.expected_deliverable) t.expected_deliverable = String(rawTask.deliverable ?? rawTask.outcome ?? 'Completed task')
    if (!t.risk_level) t.risk_level = String(rawTask.risk ?? 'medium') as any

    if (!validRisks.includes(t.risk_level as string)) t.risk_level = 'medium'
    // CRITICAL: Always generate a fresh UUID. LLMs hallucinate/scramble UUIDs
    // which then can't be found in the DB.
    t.id = crypto.randomUUID()
    if (!t.params) t.params = (t as any).params ?? {}
    if (!t.depends_on) t.depends_on = (t as any).depends_on ?? []
    if (!t.model) t.model = (t as any).model ?? CLOUD_MODEL
  }

  return {
    ok: true,
    is_valid_goal: true,
    plan: {
      goal: parsed.plan.goal ?? '',
      risk_note: parsed.plan.risk_note ?? 'Plan drafted.',
      data_gathered: parsed.plan.data_gathered ?? {},
      tasks: parsed.plan.tasks as OrchestratorTask[],
    },
  }
}

/**
 * Runs the orchestrator against a founder's goal.
 */
export async function runOrchestratorTask(
  founderInput: string,
  goalId: string,
  conversationHistory: any[] = [],
  forcePlan: boolean = false
): Promise<{ is_valid_goal: boolean; clarification_question?: string; plan?: OrchestratorPlan }> {
  const supabase = createServerSupabaseClient()

  // 1. Fetch Orchestrator persona & Goal owner
  const [{ data: orchestratorDept }, { data: goalRow }] = await Promise.all([
    supabase
      .from('departments')
      .select('id, persona_prompt, capabilities, restrictions, slug')
      .eq('is_orchestrator', true)
      .single(),
    supabase
      .from('goals')
      .select('created_by')
      .eq('id', goalId)
      .single()
  ])

  const userId = goalRow?.created_by
  
  // 1.1 Save user context if last message was from user
  const lastMsg = conversationHistory[conversationHistory.length - 1]
  if (lastMsg && lastMsg.role === 'user') {
    await saveContextMemo(goalId, lastMsg.content, userId)
  }

  const personaPrompt = orchestratorDept?.persona_prompt
    ?? `You are the Orchestrator. Your job is to decompose the founder's goal into a structured JSON plan.`

  try {
    // 2. Fetch Active Departments
    const { data: allActiveDepts } = await supabase
      .from('departments')
      .select('id, name, slug, status, current_task')
      .eq('activation_stage', 'active')
      .neq('is_orchestrator', true)

    const activeDeptsList = allActiveDepts ?? []

    // 3. Fetch Recent Memos & Context Sync
    const now = new Date().toISOString()
    const memoResults = await Promise.all(
      activeDeptsList.map(async (d) => {
        const { data: memos } = await supabase
          .from('company_memos')
          .select('title, body, priority, confidence, created_at, source_type, version_tag')
          .eq('from_department_id', d.id)
          .or(`valid_until.is.null,valid_until.gt.${now}`)
          .order('created_at', { ascending: false })
          .limit(3)
        return { slug: d.slug, memos: memos ?? [] }
      })
    )

    const { data: goalSpecificMemos } = await supabase
      .from('company_memos')
      .select('title, body, priority, confidence, created_at, source_type, version_tag')
      .eq('goal_id', goalId)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(10)

    const memoMap = Object.fromEntries(memoResults.map(r => [r.slug, r.memos]))

    const formatMemos = (memos: any[]) =>
      memos && memos.length > 0
        ? memos.map(m => {
            const version = m.version_tag ? ` [v:${m.version_tag}]` : ''
            return `[${m.priority}][confidence:${(m.confidence ?? 0.5).toFixed(2)}]${version} ${m.title}: ${String(m.body || '').slice(0, 800)}...`
          }).join('\n')
        : 'No recent memos.'

    // 4. Build Context — Tier 1 (foundational + current context) always first
    const systemMemory = await buildOrcContext(userId)

    const dataGatheredContext = [
      systemMemory ? `## SYSTEM MEMORY\n${systemMemory}` : '',
      `## LIVE BUSINESS DATA`,
      `### Goal-Specific Context (Memos):\n` + 
        (goalSpecificMemos && goalSpecificMemos.length > 0 
          ? goalSpecificMemos.map(m => `[${m.source_type.toUpperCase()}] ${m.title}: ${String(m.body || '').slice(0, 800)}...`).join('\n')
          : 'No specific goal context yet.'),
      `### Recent department communications:\n` + 
        activeDeptsList.map(d => {
          const memos = memoMap[d.slug] || []
          return `#### [${d.slug}]\nStatus: ${d.status}${d.current_task ? ': ' + d.current_task : ''}\nRecent Memos: ${formatMemos(memos)}`
        }).join('\n\n'),
      `### Available Departments:\n${activeDeptsList.map(d => `- ${d.slug}`).join('\n')}`,
    ].join('\n\n')

    const budget = await checkTokenBudget()
    if (!budget.allowed) {
      throw new Error('TOKEN_BUDGET_EXCEEDED')
    }

    const conversationContext = conversationHistory.length > 0
      ? `### PREVIOUS CLARIFICATION CHAT:\n${conversationHistory.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n')}`
      : 'No previous conversation.'

    const forcePlanDirective = forcePlan 
      ? '\nDIRECTIVE: The founder has skipped clarification. You MUST produce a plan now. Set "is_valid_goal": true.'
      : ''

    // Centralized Research Detection (Heuristic)
    const researchKeywords = ['market', 'competitor', 'trend', 'regulation', 'research', 'search', 'price', 'analyze', 'survey']
    const needsResearch = researchKeywords.some(kw => founderInput.toLowerCase().includes(kw))
    const researchDirective = needsResearch
      ? '\nCENTRALIZED RESEARCH: This goal appears to require general market or external data. You MUST insert a single "Master Research Task" at the start of the plan to gather all necessary data at once. All other tasks that need this data must depend on it and read its Memo.'
      : ''

    const prompt = `GOAL: ${founderInput}
${forcePlanDirective}
${researchDirective}

${conversationContext}

${dataGatheredContext}

Plan across multiple departments if needed. Coordinate their deliverables. Ensure realistic risk assessment.`

    // 5. Build Final Prompt and Call LLM
    const finalPrompt = await buildFinalPrompt(
      personaPrompt,
      prompt,
      orchestratorDept?.capabilities ?? [],
      orchestratorDept?.restrictions ?? [],
      orchestratorDept?.slug,
      goalId
    )

    const { content, tokensUsed } = await callLLM(getModel('planning'), finalPrompt, ORCHESTRATOR_SYSTEM_NOTE)

    // 6. Parse result
    const result = parseOrchestratorResponse(content)
    
    if (!result.ok) {
      // Log the full raw response for debugging
      await logEvent({
        event_type: 'error',
        department_slug: 'orchestrator',
        goal_id: goalId,
        description: `Orchestrator parse failed.`,
        metadata: { goal_id: goalId, error: result.reason, raw_response: content.slice(0, 1000) },
        created_by: userId
      })
      throw new Error(result.reason)
    }

    // 7. Handle Result
    if (result.is_valid_goal === false) {
      const question = result.clarification_question!
      const updatedHistory = [
        ...conversationHistory, 
        { role: 'assistant', content: question, ts: new Date().toISOString() }
      ]
      
      await supabase.from('goals').update({
        status: 'clarifying',
        orc_conversation: updatedHistory,
      }).eq('id', goalId)

      await logEvent({
        event_type: 'memo_written',
        department_slug: 'orchestrator',
        goal_id: goalId,
        description: `Orc requested clarification.`,
        tokens_used: tokensUsed,
        metadata: { goal_id: goalId, question },
        created_by: userId
      })

      return result
    }

    if (result.is_valid_goal && result.plan) {
      const { plan } = result
      if (!plan.data_gathered) plan.data_gathered = {}
      
      // Validation: Filter out tasks assigned to non-existent departments
      const validSlugs = activeDeptsList.map(d => d.slug)
      const invalidTasks = plan.tasks.filter(t => !validSlugs.includes(t.dept))
      if (invalidTasks.length > 0) {
        console.warn(`[Orc] Removing ${invalidTasks.length} tasks with invalid departments: ${invalidTasks.map(t => t.dept).join(', ')}`)
        plan.tasks = plan.tasks.filter(t => validSlugs.includes(t.dept))
      }

      activeDeptsList.forEach(d => {
        const memos = memoMap[d.slug] || []
        plan.data_gathered[d.slug] = memos.length > 0 ? formatMemos(memos) : null
      })

      await supabase.from('goals').update({
        orchestrator_plan: plan,
        risk_note: plan.risk_note,
        status: 'awaiting_approval',
      }).eq('id', goalId)

      // CRITICAL: Clear old pending/planned tasks before inserting new ones.
      // This prevents UI clutter and orphaned tasks if the Orchestrator re-plans.
      await supabase
        .from('goal_tasks')
        .delete()
        .eq('goal_id', goalId)
        .in('status', ['pending', 'planned', 'awaiting_approval'])

      if (plan.tasks.length > 0) {
        const taskRows = plan.tasks.map(t => ({
          goal_id: goalId,
          task_id: t.id,
          created_by: userId,
          dept_slug: t.dept,
          action: t.action,
          label: t.label,
          reasoning: t.reasoning,
          // expected_deliverable: t.expected_deliverable, // Column missing in DB schema cache
          params: t.params,
          risk_level: t.risk_level,
          depends_on: t.depends_on,
          model: t.model,
          status: 'pending',
        }))

        const { error: insertError } = await supabase.from('goal_tasks').insert(taskRows)
        if (insertError) {
          console.error('[runOrchestratorTask] CRITICAL: Failed to insert goal_tasks:', insertError)
          // Log for diagnostics but don't throw — the plan is already saved in the JSON blob
          await logEvent({
            event_type: 'error',
            department_slug: 'orchestrator',
            goal_id: goalId,
            description: `Failed to insert ${taskRows.length} tasks into goal_tasks`,
            metadata: { error: insertError.message, code: insertError.code, task_ids: taskRows.map(r => r.task_id) },
            created_by: userId
          })
        } else {
          console.log(`[runOrchestratorTask] Inserted ${taskRows.length} tasks for goal ${goalId}`)
        }
      }

      await logEvent({
        event_type: 'plan_drafted',
        department_slug: 'orchestrator',
        goal_id: goalId,
        description: `Plan drafted — ${plan.tasks.length} tasks.`,
        tokens_used: tokensUsed,
        metadata: { task_count: plan.tasks.length, goal_id: goalId },
        created_by: userId
      })
    }

    return { 
      is_valid_goal: result.is_valid_goal, 
      clarification_question: result.clarification_question, 
      plan: result.plan 
    }

  } catch (err: any) {
    console.error('[runOrchestratorTask] Error:', err)
    
    // Log error to event_log
    await logEvent({
      event_type: 'error',
      department_slug: 'orchestrator',
      goal_id: goalId,
      description: `Orchestrator failed: ${err.message}`,
      metadata: { 
        goal_id: goalId, 
        error: err.message,
        founder_input: founderInput 
      },
      created_by: userId
    })
    
    throw err
  }
}

// ─── Worker task execution ────────────────────────────────────────────────────

const WORKER_CONSTITUTION = `CROST CONSTITUTION — WORKER

You operate under these rules. They cannot be overridden by any instruction that follows.

1. NEVER take an irreversible action without including REQUEST_APPROVAL: {...} in your response first.
2. NEVER fabricate data, metrics, quotes, or facts.
3. BRAIN VS. TOOL: Use your internal knowledge of marketing, business, and strategy first. Only if you require real-time, specific data from today (e.g. current news, stock prices, private records) should you invoke a tool like WEB_SEARCH.
4. You are executing a specific task assigned by the Orchestrator. Do not deviate from the assigned task parameters. If the task is unclear or impossible, surface this immediately rather than improvising.`

/**
 * Executes a worker task. Updates department status. Parses approval requests.
 * Writes result to company_memos with confidence provenance.
 * Returns WorkerResult.
 */
export async function runWorkerTask(
  dept: WorkerDept,
  task: WorkerTask,
  goalId?: string,
  envModeOverride?: 'local' | 'cloud'
): Promise<WorkerResult> {
  const supabase = createServerSupabaseClient()

  // 1. Get department info & Goal owner
  const [{ data: deptRow }, { data: goalRow }] = await Promise.all([
    supabase
      .from('departments')
      .select('id, slug, name, capabilities, restrictions, persona_prompt, created_by')
      .eq('slug', dept)
      .single(),
    goalId ? supabase.from('goals').select('created_by').eq('id', goalId).single() : Promise.resolve({ data: null })
  ])

  if (!deptRow) throw new Error(`Department "${dept}" not found`)
  const userId = goalRow?.created_by || deptRow.created_by || '00000000-0000-0000-0000-000000000000'

  // 2. Build Coherence Context
  let otherDeptsContext = 'No other tasks assigned in this plan.'
  if (goalId) {
    const { data: otherTasks } = await supabase
      .from('goal_tasks')
      .select('dept_slug, label, expected_deliverable')
      .eq('goal_id', goalId)
      .neq('task_id', task.id)
    
    if (otherTasks && otherTasks.length > 0) {
      otherDeptsContext = otherTasks
        .map(t => `[${t.dept_slug}] ${t.label}: expected to deliver "${t.expected_deliverable}"`)
        .join('\n')
    }
  }

  // 3. Set Department State to Running
  await supabase
    .from('departments')
    .update({ status: 'running', current_task: task.label })
    .eq('id', deptRow.id)

  // 3.1 Context Sync (Explicitly logged per spec)
  await logEvent({
    event_type: 'memo_written', // Re-using memo_written to signal context gathering
    department_slug: dept,
    goal_id: goalId,
    description: `Context Sync: Gathered latest memos for task ${task.id}`,
    metadata: { task_id: task.id, goal_id: goalId },
    created_by: userId
  })

  await logEvent({
    event_type: 'task_started',
    department_slug: dept,
    goal_id: goalId,
    description: `${task.label}`,
    metadata: { task_id: task.id, action: task.action, goal_id: goalId },
    created_by: userId
  })

  // 4. Build Final Task Prompt
  const departmentPrompt = deptRow.persona_prompt || `You are the ${deptRow.name} department.`
  
  const coherenceBlock = {
    role: `You are the ${deptRow.name} department.`,
    goal: "Execute precisely and output JSON as requested.",
    db_schema: "AVAILABLE_TABLES: goals, goal_tasks, company_memos, departments, event_log, artifacts, approval_queue.",
    peer_activity: otherDeptsContext,
    must_deliver: task.expected_deliverable || task.label,
    restrictions: (deptRow.restrictions ?? []).join(", "),
  }

  const taskPrompt = `${WORKER_CONSTITUTION}\n\nCOHERENCE_BLOCK:\n${JSON.stringify(coherenceBlock, null, 2)}\n\nTASK:\nID: ${task.id}\nAction: ${task.action}\nLabel: ${task.label}\nReasoning: ${task.reasoning}\nParams: ${JSON.stringify(task.params)}\n\nIMPORTANT: Response MUST be JSON conforming exactly to this schema:\n{\n  "summary": "String summarizing what you did",\n  "insights": ["Array of string insights"],\n  "risks": ["Array of strings"],\n  "confidence": 0.9,\n  "needs_more_data": false,\n  "missing_data": ["Optional list of missing context"],\n  "tool_call": { "name": "GMAIL_SEARCH_EMAILS", "args": { "q": "from:leads" } },\n  "next_actions": ["Optional list of recommended actions"]\n}\n\nTo interact with external tools, you must return a JSON object with the key 'tool_call'. Format: {"tool_call": { "name": "TOOL_NAME", "args": { ... } } }.\nDo not simulate the output. The system will provide the real data in the next turn via a Memo.`

  try {
    const prompt = await buildFinalPrompt(
      departmentPrompt,
      taskPrompt,
      deptRow.capabilities ?? [],
      deptRow.restrictions ?? [],
      deptRow.slug,
      goalId
    )

    // 5. LLM Call
    const model = task.model || getModel('execution')
    const { content, tokensUsed } = await callLLM(model, prompt)

    // 6. Handle Approvals
    const approvalRequest = parseApprovalRequest(content)
    if (approvalRequest === 'BLOCKED') {
      throw new Error('APPROVAL_PARSE_BLOCKED')
    }

    if (approvalRequest) {
      const riskMap: any = { spend_budget: 'critical', delete_data: 'critical', send_email: 'high' }
      const risk = riskMap[approvalRequest.action_type] ?? 'medium'

      await supabase.from('approval_queue').insert({
        department_id: deptRow.id,
        department_name: deptRow.name,
        department_slug: dept,
        action_type: approvalRequest.action_type,
        action_label: approvalRequest.action_label,
        reasoning: approvalRequest.reasoning,
        payload: { ...approvalRequest.payload, __task_id: task.id },
        context: approvalRequest.context,
        risk_level: risk,
        goal_id: goalId ?? null,
        status: 'pending',
        created_by: userId
      })

      await supabase.from('departments').update({ status: 'awaiting_approval' }).eq('id', deptRow.id)

      return { task_id: task.id, status: 'needs_approval', result: {}, memo_summary: '', errors: [] }
    }

    // 7. Parse Result JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    let workerResult: WorkerResult = {
      task_id: task.id,
      status: 'completed',
      result: { raw: content },
      memo_summary: content.slice(0, 200),
      errors: []
    }

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.needs_more_data) {
          workerResult.status = 'needs_data'
          workerResult.memo_summary = `BLOCKED (Needs Data): ${(parsed.missing_data || []).join(', ')}`
        } else {
          workerResult.status = 'completed'
          workerResult.memo_summary = parsed.summary || content.slice(0, 200)
        }
        workerResult.result = parsed
        ;(workerResult as any).confidence = parsed.confidence
        ;(workerResult as any).based_on = parsed.insights || []
        
        // 7.1 Handle Composio Tool Execution (V2)
        const toolCall = parsed.tool_call;
        if (toolCall?.name) {
          try {
            console.log(`[Worker] Calling /api/worker/execute for task ${task.id} with tool ${toolCall.name}`);
            const toolRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/worker/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskId: task.id,
                goalId: goalId,
                userId: userId,
                toolName: toolCall.name,
                args: toolCall.args || {}
              })
            })
            
            if (toolRes.ok) {
              const toolData = await toolRes.json()
              
              if (toolData.needs_more_data) {
                workerResult.status = 'needs_data'
                workerResult.result = toolData
                workerResult.memo_summary = `BLOCKED (Hallucination): ${toolData.error}`
              } else {
                workerResult.tool_request = { tool: toolCall.name, params: toolCall.args || {} }
                workerResult.memo_summary = `[TOOL EXECUTION: ${toolCall.name}] ${workerResult.memo_summary}\n\nResult: ${JSON.stringify(toolData)}`
              }
              
              await logEvent({
                event_type: 'action_executed',
                department_slug: dept,
                goal_id: goalId,
                description: `Executed tool: ${toolCall.name}`,
                metadata: { tool: toolCall.name, result: toolData },
                created_by: userId
              })
            } else {
              const errText = await toolRes.text()
              workerResult.errors.push(`Tool ${toolCall.name} failed: ${errText}`)
              workerResult.memo_summary = `[TOOL EXECUTION FAILED: ${toolCall.name}] ${workerResult.memo_summary}\n\nError: ${errText}\nThe tool is likely disconnected or unauthorized. Founder intervention is required.`
              
              await logEvent({
                event_type: 'error',
                department_slug: dept,
                goal_id: goalId,
                description: `Tool failure: ${toolCall.name} (Not Connected/Failed)`,
                metadata: { tool: toolCall.name, error: errText },
                created_by: userId
              })
            }
          } catch (toolErr: any) {
            console.error('Composio call failed:', toolErr)
            workerResult.errors.push(`Composio call failed: ${toolErr.message}`)
          }
        }
        // Fallback for legacy tool_request format
        else if (parsed.tool_request?.tool) {
          try {
            const toolRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/tools/execute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...parsed.tool_request,
                goal_id: goalId,
                task_id: task.id,
                department_slug: dept,
                department_id: deptRow.id
              })
            })
            
            if (toolRes.ok) {
              const toolData = await toolRes.json()
              workerResult.tool_request = parsed.tool_request
              workerResult.memo_summary = `[TOOL EXECUTION: ${parsed.tool_request.tool}] ${workerResult.memo_summary}\n\nResult: ${JSON.stringify(toolData.data)}`
              
              await logEvent({
                event_type: 'tool_executed' as any,
                department_slug: dept,
                goal_id: goalId,
                description: `Executed tool: ${parsed.tool_request.tool}`,
                metadata: { tool: parsed.tool_request.tool, result: toolData.data },
                created_by: userId
              })
            } else {
              const errText = await toolRes.text()
              workerResult.errors.push(`Tool ${parsed.tool_request.tool} failed: ${errText}`)
            }
          } catch (toolErr: any) {
            console.error('MCP Engine call failed:', toolErr)
            workerResult.errors.push(`MCP Engine call failed: ${toolErr.message}`)
          }
        }
      } catch (e) {
        console.error('Failed to parse final worker json result:', e)
      }
    }

    // 8. Write Memo (with egress compression)
    if (workerResult.memo_summary) {
      await supabase.from('company_memos').insert({
        goal_id: goalId || null,
        task_id: task.id,
        from_department: deptRow.name,
        from_department_id: deptRow.id,
        title: `[${task.action}] ${task.label}`,
        body: formatMemoBody(workerResult.memo_summary),
        tags: [task.action, dept],
        confidence: (workerResult as any).confidence ?? 0.8,
        source_type: 'agent',
        created_by: userId
      })
    }

    // 9. Update State based on Worker Status
    await supabase.from('goal_tasks').update({ status: workerResult.status, completed_at: new Date().toISOString() }).eq('task_id', task.id)
    await supabase.from('departments').update({ status: 'idle', current_task: null }).eq('id', deptRow.id)

    // 9.1 Check for Goal Completion or Chain Reaction
    if (goalId) {
      const { data: allTasks } = await supabase
        .from('goal_tasks')
        .select('task_id, status, depends_on')
        .eq('goal_id', goalId)
      
      const total = allTasks?.length || 0
      const finishedCount = (allTasks || []).filter(t => ['completed', 'failed', 'rejected', 'expired'].includes(t.status)).length
      
      if (total > 0 && finishedCount === total) {
        console.log(`[Worker] Goal ${goalId} finished (${finishedCount}/${total} tasks). Triggering synthesis...`)
        try {
          // Update goal status BEFORE running the report so UI reflects completion immediately
          await supabase.from('goals').update({ status: 'completed' }).eq('id', goalId)
          await runOrcReport(goalId)
        } catch (synthesisErr) {
          console.error('[Worker] Synthesis failed:', synthesisErr)
        }
      } else {
        // Chain Reaction: Check if any 'planned' (waiting for deps) tasks can now be released
        const pendingBatch = (allTasks || []).filter(t => t.status === 'planned')
        
        // Waterfall verification: Fetch all memos for this goal to ensure they exist before unblocking
        const { data: goalMemos } = await supabase.from('company_memos').select('task_id').eq('goal_id', goalId)
        const postedMemoTaskIds = new Set((goalMemos || []).map(m => m.task_id).filter(Boolean))

        for (const t of pendingBatch) {
          const dependencies = t.depends_on || []
          const blockers = dependencies.filter((depId: string) => {
            const depTask = (allTasks || []).find(at => at.task_id === depId)
            // Block if task not completed OR memo doesn't exist yet
            return !depTask || depTask.status !== 'completed' || !postedMemoTaskIds.has(depId)
          })

          if (blockers.length === 0) {
            console.log(`[Worker] Dependency satisfied (Data Verified) for task ${t.task_id}. Re-triggering dispatch...`)
            // Re-trigger via internal fetch (server-to-server)
            // Passing x-crost-internal-secret to bypass auth gate for automated chain reactions
            fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/goals/${goalId}/dispatch`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'x-crost-internal-secret': process.env.SUPABASE_SERVICE_ROLE_KEY || ''
              },
              body: JSON.stringify({ task_id: t.task_id })
            }).catch(e => console.error('[Worker] Chain reaction dispatch failed:', e))
          }
        }
      }
    }

    // 10. Generate Artifact (Phase 4 integration)
    const res = workerResult.result as any
    const bodyContent = res?.body || res?.content || workerResult.memo_summary
    
    if (bodyContent && String(bodyContent).length > 50) {
      const isLarge = String(bodyContent).length > 5000
      // Offload to storage if output is exceptionally large, preserving DB performance
      const previewUrl = isLarge ? await uploadArtifact(goalId || null, task.id, String(bodyContent)) : null

      await supabase.from('artifacts').insert({
        goal_id: goalId || null,
        department_id: deptRow.id,
        department_slug: dept,
        artifact_type: (task.action.includes('design') || task.action.includes('creative')) ? 'image' : 'document',
        title: task.label,
        body: truncateString(String(bodyContent), 5000), 
        preview_url: previewUrl,
        metadata: { 
          task_id: task.id, 
          action: task.action, 
          model: task.model,
          is_stored_externally: isLarge,
          generated_at: new Date().toISOString()
        },
        created_by: userId
      })
    }

    if (workerResult.status === 'needs_data') {
      const missingElements = (workerResult.result as any).missing_data?.join(', ') || 'Clarification required.'
      
      // Alert the founder by appending to orc_conversation and setting goal status to clarifying
      const { data: currentGoal } = await supabase.from('goals').select('orc_conversation').eq('id', goalId).single()
      const newConvo = currentGoal?.orc_conversation || []
      
      newConvo.push({
        role: 'assistant',
        content: `**[${deptRow.name} Blocked]** We need more information to proceed with "${task.label}".\n\n**Missing Data:** ${missingElements}`,
        ts: new Date().toISOString()
      })

      await supabase.from('goals').update({ 
        status: 'clarifying',
        orc_conversation: newConvo 
      }).eq('id', goalId)

      await logEvent({
        event_type: 'task_blocked',
        department_slug: dept,
        goal_id: goalId,
        description: `Blocked (Needs Data): ${task.label}`,
        tokens_used: tokensUsed,
        created_by: userId
      })
    } else {
      await logEvent({
        event_type: 'task_completed',
        department_slug: dept,
        goal_id: goalId,
        description: `Completed: ${task.label}`,
        tokens_used: tokensUsed,
        created_by: userId
      })
    }

    return workerResult

  } catch (err: any) {
    await supabase.from('departments').update({ status: 'error', current_task: null }).eq('id', deptRow.id)
    await logEvent({ 
      event_type: 'error', 
      department_slug: dept, 
      goal_id: goalId, 
      description: `Task failed: ${err.message}`,
      created_by: userId
    })
    return { task_id: task.id, status: 'failed', result: {}, memo_summary: '', errors: [err.message] }
  }
}

// ─── Orc Synthesis Report ───────────────────────────────────────────────────

export async function runOrcReport(goalId: string): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
  if (!goal) return

  // 1. IDEMPOTENCY — Don't re-run synthesis if a report memo already exists for this goal
  const { data: existingReport } = await supabase
    .from('company_memos')
    .select('id')
    .eq('goal_id', goalId)
    .eq('source_type', 'orchestrator')
    .ilike('title', '[ORC REPORT]%')
    .maybeSingle()

  if (existingReport) {
    console.log(`[Orc Report] Report already exists for goal ${goalId}. Skipping synthesis.`)
    return
  }

  const { data: memos } = await supabase.from('company_memos').select('*').eq('goal_id', goalId)
  if (!memos || memos.length === 0) return

  const context = memos.map(m => `### [${m.from_department}] ${m.title}\n${m.body}`).join('\n\n')
  const prompt = `Goal: ${goal.founder_input}\n\nFindings:\n${context}\n\nSynthesize this into a high-level strategic report with a NEXT STEP recommendation. Markdown only.`

  try {
    const { content } = await callLLM(CLOUD_MODEL, prompt, "You are the Orc Chief of Staff. Synthesize results.")
    await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'Orchestrator',
      title: `[ORC REPORT] ${goal.title}`,
      body: formatMemoBody(content),
      priority: 'high',
      source_type: 'orchestrator',
      created_by: goal.created_by
    })
    await logEvent({
      event_type: 'goal_post_mortem_written',
      department_slug: 'orchestrator',
      goal_id: goalId,
      description: `Report generated.`,
      created_by: goal.created_by
    })

    // 2. Feed back to user via the active Dialogue session
    const newConvo = goal.orc_conversation || []
    newConvo.push({
      role: 'assistant',
      content: `### Strategic Synthesis Report\n\n${content}`,
      ts: new Date().toISOString()
    })

    await supabase.from('goals').update({
      orc_conversation: newConvo
    }).eq('id', goalId)
  } catch (err) {
    console.error('[runOrcReport] Failed:', err)
  }
}


