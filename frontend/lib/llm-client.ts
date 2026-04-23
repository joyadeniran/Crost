// lib/llm-client.ts
// The ONLY file that communicates with the LLM/LiteLLM layer.
// Refactored to use LiteLLM as the primary proxy for all model calls.
// Server-side ONLY — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'
import { getModelForTask } from './model-routing'
import { resolveApiKey } from './key-resolver'
import { logUsage } from './usage-logger'
import { detectOutputType } from './artifact-transformers'
import type {
  Department,
  OrchestratorPlan,
  OrchestratorTask,
  WorkerTask,
  WorkerResult,
  WorkerDept,
} from '@/types'
import { truncateString, cleanLargePayload, formatMemoBody } from './utils'
import { loadSkillsForTask } from './skills'

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

const DEFAULT_ASSISTANT_IDENTITY = `You are part of Crost's AI operating system.
Write professionally and clearly. Be direct, warm, and human.
Avoid corporate buzzwords. Adapt tone to context: technical when needed, conversational when appropriate.`

function cleanConfigValue(value: unknown): string {
  if (value == null) return ''
  const cleaned = String(value).replace(/^"|"$/g, '').trim()
  return cleaned === 'null' ? '' : cleaned
}

async function resolveDepartmentBySlug(
  slug: string,
  userId?: string | null
): Promise<Department | null> {
  const supabase = createServerSupabaseClient()

  if (userId) {
    const { data: userDepartment } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', slug)
      .eq('created_by', userId)
      .maybeSingle()

    if (userDepartment) return userDepartment as Department
  }

  const { data: globalDepartment } = await supabase
    .from('departments')
    .select('*')
    .eq('slug', slug)
    .is('created_by', null)
    .maybeSingle()

  return (globalDepartment as Department | null) ?? null
}

async function resolveOrchestratorDepartment(userId?: string | null): Promise<Department | null> {
  const supabase = createServerSupabaseClient()

  if (userId) {
    const { data: userOrchestrator } = await supabase
      .from('departments')
      .select('*')
      .eq('is_orchestrator', true)
      .eq('created_by', userId)
      .maybeSingle()

    if (userOrchestrator) return userOrchestrator as Department
  }

  const { data: globalOrchestrator } = await supabase
    .from('departments')
    .select('*')
    .eq('is_orchestrator', true)
    .is('created_by', null)
    .maybeSingle()

  return (globalOrchestrator as Department | null) ?? null
}

// ─── Approval signal regex ────────────────────────────────────────────────────

const APPROVAL_SIGNAL_MARKER = 'REQUEST_APPROVAL'
const APPROVAL_REGEX = /REQUEST_APPROVAL:?[\s\S]*?(\{[\s\S]*?\})/

/**
 * Standalone storage helper — detects format, transforms to docx/xlsx/md, uploads to Storage.
 * Returns { fileUrl, artifactType, extension } or null on failure.
 */
async function uploadArtifact(
  goalId: string | null,
  taskId: string,
  deptSlug: string,
  content: string
): Promise<{ fileUrl: string; artifactType: 'document' | 'spreadsheet' | 'data'; extension: string } | null> {
  const supabase = createServerSupabaseClient()

  try {
    // Strip markdown code fences LLMs often wrap JSON in
    const stripped = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    const isJson = (stripped.startsWith('{') && stripped.endsWith('}')) || (stripped.startsWith('[') && stripped.endsWith(']'))

    const detection = detectOutputType(stripped, isJson)

    let fileContent: string | Buffer = stripped
    if (detection.transformer) {
      try {
        const parsedContent = isJson ? JSON.parse(stripped) : stripped
        fileContent = await detection.transformer(parsedContent) as string | Buffer
      } catch (err) {
        console.error('[uploadArtifact] Transform error, falling back to raw:', err)
        fileContent = stripped
        detection.targetFormat = isJson ? 'json' : 'md'
      }
    }

    const mimeMap: Record<string, string> = {
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      md: 'text/markdown',
      json: 'application/json',
      txt: 'text/plain',
      csv: 'text/csv',
    }
    const typeMap: Record<string, 'document' | 'spreadsheet' | 'data'> = {
      docx: 'document', md: 'document', txt: 'document',
      xlsx: 'spreadsheet', csv: 'spreadsheet',
      json: 'data',
    }

    const ext = detection.targetFormat
    const contentType = mimeMap[ext] || 'text/plain'
    const artifactType = typeMap[ext] || 'document'
    const fileName = `goals/${goalId || 'global'}/task-${taskId}-${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('artifacts')
      .upload(fileName, fileContent, { contentType, upsert: false })

    if (error || !data) {
      console.error('[uploadArtifact] Storage upload failed:', error)
      return null
    }

    const { data: urlData } = supabase.storage.from('artifacts').getPublicUrl(data.path)
    return { fileUrl: urlData.publicUrl, artifactType, extension: ext }
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
  goalId?: string,
  // Spec §9.5: pre-loaded skill content from loadSkillsForTask().
  // Injected as a ## SKILLS GUIDANCE section before identity context.
  skillContent?: string
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

  let founderIdentity = ''
  let companyIdentity = ''
  let assistantIdentity = DEFAULT_ASSISTANT_IDENTITY
  let legacyIdentity = ''
  if (userId) {
    const { data: identityRows } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['founder_name', 'company_name', 'founder_identity', 'company_identity', 'assistant_identity', 'local_identity'])
      .eq('created_by', userId)
      .order('key')

    const identityMap = new Map((identityRows ?? []).map((row) => [row.key, cleanConfigValue(row.value)]))
    const founderName = identityMap.get('founder_name') ?? ''
    const companyName = identityMap.get('company_name') ?? ''

    founderIdentity = identityMap.get('founder_identity') || (founderName ? `Founder: ${founderName}` : '')
    companyIdentity = identityMap.get('company_identity') || (companyName ? `Company: ${companyName}` : '')
    assistantIdentity = identityMap.get('assistant_identity') || DEFAULT_ASSISTANT_IDENTITY
    legacyIdentity = identityMap.get('local_identity') || ''
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
    `- KNOWLEDGE_BASE_SEARCH: Search the founder's uploaded knowledge base (documents, reports, handbooks, pitch decks, etc.). Use this whenever the founder references an uploaded file, asks about company documents, or when grounding the response in founder-provided context would help. Args: { "service": "internal", "action": "knowledge_base_search", "query": "<search terms>", "category": "<optional: company_profile|pitch_deck|financial_report|handbook|meeting_notes|research|legal|marketing|sales|product|operations>", "limit": 5 }`,
    ...(tools ?? []).map(t => `- ${t.id.toUpperCase()}: ${t.description}`)
  ].join('\n')

  const identityHandling = departmentSlug === 'orchestrator'
    ? [
        'You are Orc, the Chief of Staff for the founder.',
        'The IDENTITY CONTEXT below describes the founder, company, and assistant configuration, not a single merged biography.',
        'Never introduce yourself as the founder, never use the founder\'s name as your own, and never describe the founder\'s mission as your own biography.',
        'If asked who you are, answer as Orc / Chief of Staff.',
        'Respect the ASSISTANT IDENTITY section as your operating voice, while treating founder and company identity as context you serve.'
      ].join('\n')
    : [
        'The IDENTITY CONTEXT below describes the founder and company context you are serving.',
        'Do not claim to be the founder. Speak as the department lead serving the founder.'
      ].join('\n')

  const identityContext = [
    founderIdentity ? `### FOUNDER IDENTITY\n${founderIdentity}` : '',
    companyIdentity ? `### COMPANY IDENTITY\n${companyIdentity}` : '',
    assistantIdentity ? `### ASSISTANT IDENTITY\n${assistantIdentity}` : '',
    !founderIdentity && !companyIdentity && legacyIdentity ? `### LEGACY IDENTITY\n${legacyIdentity}` : '',
  ].filter(Boolean).join('\n\n')

  const hitlProtocol = departmentSlug && departmentSlug !== 'orchestrator'
    ? `## HITL APPROVAL PROTOCOL (Mandatory)

You MUST request founder approval before taking ANY external action (sending emails, posting messages, creating/deleting records, pushing to GitHub, etc.).

When you need to take an external action, OUTPUT ONLY this block and STOP — do not also narrate or describe the action:

REQUEST_APPROVAL: {
  "action_type": "<category: email_send | slack_post | github_push | data_write | calendar_event | other>",
  "action_label": "<short human-readable description of what you are about to do>",
  "reasoning": "<why this action is necessary for the task>",
  "payload": { <all parameters needed to execute the action once approved> },
  "context": "<brief context for the founder reviewing this request>"
}

Rules:
- NEVER send an email, post to Slack, push code, or modify external data without outputting REQUEST_APPROVAL first.
- If the task only requires analysis, research, or writing a draft — complete it without REQUEST_APPROVAL.
- Do NOT include any text after the REQUEST_APPROVAL block. It will be parsed automatically.`
    : ''

  return [
    `## CROST CONSTITUTION (Non-negotiable)\n${constitution}`,
    `## YOUR ROLE\n${departmentPrompt}`,
    // Spec §9.5: inject skill guidance immediately after role definition so the
    // model reads the output contract (JSON schema, structure rules, anti-patterns)
    // before it sees identity or memo context.
    skillContent ? `## SKILLS GUIDANCE\n${skillContent}` : '',
    `## IDENTITY HANDLING\n${identityHandling}`,
    `## IDENTITY CONTEXT\n${identityContext || `### ASSISTANT IDENTITY\n${DEFAULT_ASSISTANT_IDENTITY}`}`,
    (capLine || restLine) ? `## CAPABILITY BOUNDARIES\n${[capLine, restLine].filter(Boolean).join('\n\n')}` : '',
    `## AVAILABLE TOOLS\n${toolDefinitions}`,
    hitlProtocol,
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

export async function callEmbeddings(
  input: string | string[],
  userId?: string | null
): Promise<number[][]> {
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
  const provider = model.split('/')[0]

  // Key resolution
  const { apiKey } = await resolveApiKey({ userId, provider })

  const body: any = {
    model,
    input: Array.isArray(input) ? input : [input],
  }
  if (apiKey) body.api_key = apiKey

  const res = await fetch(`${LITELLM_BASE_URL}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(LITELLM_MASTER_KEY && { 'Authorization': `Bearer ${LITELLM_MASTER_KEY}` })
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Embedding error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return data.data.map((item: any) => item.embedding)
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
      const dept = await resolveDepartmentBySlug(input.department_slug, input.created_by)
      departmentId = dept?.id ?? null
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

const ORCHESTRATOR_SYSTEM_NOTE = `You are Orc, the company's Chief of Staff. You are a JSON-only orchestration engine. You MUST respond with valid JSON matching this exact schema — no prose, no markdown fences, no commentary before or after:

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
4. BRAIN VS. TOOL: Use tools ONLY for data the LLM cannot know. Use Brain for strategy/creative.
5. If conversation history exists, you MUST incorporate the latest founder reply. Do not repeat the same clarification question after the founder has already answered.
6. If the founder's latest reply selects or paraphrases one of your suggested options, treat it as valid input and draft the plan.
7. Never refer to yourself as the founder or use the founder's personal identity as your own.`

function formatConversationHistory(history: Array<{ role: string; content: string; ts?: string }>): string {
  if (!history.length) return 'None'
  return history
    .slice(-8)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
    .join('\n')
}

function normalizeClarification(text: string | null | undefined): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

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
      // Pass 1: build old-LLM-id → new-uuid map and replace task IDs
      // IMPORTANT: depends_on arrays reference the LLM's placeholder IDs.
      // We must remap them AFTER replacing all task IDs, not during.
      const idMap = new Map<string, string>()
      for (const t of parsed.plan.tasks) {
        const newId = crypto.randomUUID()
        idMap.set(t.id, newId)
        t.id = newId
        // Normalize legacy/invalid model aliases to 'cloud' sentinel so
        // runWorkerTask resolves them via user_model_assignments at runtime
        const isLegacyAlias = !t.model
          || t.model.startsWith('cloud/')
          || t.model.startsWith('local/')
        if (isLegacyAlias) t.model = 'cloud'
      }
      // Pass 2: remap depends_on to the new UUIDs
      // Without this, dependency IDs remain as LLM placeholders and
      // the waterfall gate in the worker never resolves — tasks block forever.
      for (const t of parsed.plan.tasks) {
        t.depends_on = (t.depends_on ?? []).map(
          (depId: string) => idMap.get(depId) ?? depId
        )
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
  const { data: goalRow } = await supabase.from('goals').select('created_by').eq('id', goalId).single()
  const userId = goalRow?.created_by
  const orcDept = await resolveOrchestratorDepartment(userId)
  const lastMsg = conversationHistory[conversationHistory.length - 1]
  if (lastMsg && lastMsg.role === 'user') {
    await saveContextMemo(goalId, lastMsg.content, userId)
  }

  const { data: allActiveDepts } = await supabase
    .from('departments')
    .select('id, name, slug, status, current_task')
    .eq('activation_stage', 'active')
    .neq('is_orchestrator', true)
    .eq('created_by', userId)

  const activeDeptsList = allActiveDepts ?? []
  const systemMemory = await buildOrcContext(userId)
  const conversationContext = formatConversationHistory(conversationHistory)
  const prompt = [
    `GOAL: ${founderInput}`,
    forcePlan ? 'PLANNING MODE: The founder explicitly asked you to stop clarifying and draft the best possible plan with reasonable assumptions.' : '',
    `Available Departments: ${activeDeptsList.map(d => d.slug).join(', ')}`,
    `Conversation History:\n${conversationContext}`,
    `System Memory:\n${systemMemory}`,
  ].filter(Boolean).join('\n\n')

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
  let result = parseOrchestratorResponse(content)

  const previousAssistantMessage = [...conversationHistory].reverse().find((m) => m.role === 'assistant')?.content
  const latestUserMessage = [...conversationHistory].reverse().find((m) => m.role === 'user')?.content
  const repeatedClarification = result.is_valid_goal === false
    && !!previousAssistantMessage
    && normalizeClarification(result.clarification_question) !== ''
    && normalizeClarification(result.clarification_question) === normalizeClarification(previousAssistantMessage)
    && !!latestUserMessage

  if (repeatedClarification && !forcePlan) {
    const retryPrompt = `${prompt}\n\nIMPORTANT: The founder already answered your prior clarification. You repeated yourself. Draft the best possible plan now using the founder's latest reply and reasonable assumptions.`
    const retryResponse = await callLLM(planModel, await buildFinalPrompt(
      orcDept?.persona_prompt ?? 'You are the Orchestrator.',
      retryPrompt,
      orcDept?.capabilities ?? [],
      orcDept?.restrictions ?? [],
      orcDept?.slug,
      goalId
    ), ORCHESTRATOR_SYSTEM_NOTE, userId, planProvider)
    result = parseOrchestratorResponse(retryResponse.content)
  }
  
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
  const { data: goalRow } = goalId
    ? await supabase.from('goals').select('created_by').eq('id', goalId).single()
    : { data: null }
  const deptRow = await resolveDepartmentBySlug(dept, goalRow?.created_by)

  if (!deptRow) throw new Error(`Department "${dept}" not found`)
  const userId = goalRow?.created_by || deptRow.created_by

  await supabase.from('departments').update({ status: 'running', current_task: task.label }).eq('id', deptRow.id)

  // Spec §9.5: Load skills for this task before building the prompt.
  // loadSkillsForTask is non-fatal — returns empty strings/arrays if no skills match.
  const { content: skillContent, slugs: loadedSkillSlugs } = await loadSkillsForTask(
    task.action,
    dept,
    task.params
  )

  const taskPrompt = `Execute precisely and output JSON.\n\nTASK:\nID: ${task.id}\nAction: ${task.action}\nLabel: ${task.label}\nReasoning: ${task.reasoning}\nExpected Deliverable: ${task.expected_deliverable}\nParams: ${JSON.stringify(task.params)}\n\nResponse MUST be JSON.`

  const finalPrompt = await buildFinalPrompt(
    deptRow.persona_prompt,
    taskPrompt,
    deptRow.capabilities ?? [],
    deptRow.restrictions ?? [],
    deptRow.slug,
    goalId,
    skillContent || undefined
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

  // Artefact Logic: Any structured JSON output → typed file (docx/xlsx/md)
  // Plain narrative text → memo only
  const strippedContent = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  const isJsonContent = (strippedContent.startsWith('{') && strippedContent.endsWith('}')) ||
                        (strippedContent.startsWith('[') && strippedContent.endsWith(']'))

  let artifactUrl: string | null = null
  if (isJsonContent) {
    const uploaded = await uploadArtifact(goalId || null, task.id, dept, content)
    if (uploaded) {
      artifactUrl = uploaded.fileUrl
      await supabase.from('artifacts').insert({
        goal_id: goalId || null,
        created_by: userId,
        department_slug: dept,
        department_id: deptRow.id,
        artifact_type: uploaded.artifactType,
        title: `Output: ${task.label}`,
        file_url: uploaded.fileUrl,          // ← file_url, not preview_url
        // Spec §9.5: record which skill slugs were loaded when producing this artefact.
        skills_used: loadedSkillSlugs,
        metadata: {
          task_id: task.id,
          action: task.action,
          extension: uploaded.extension,
          sizeBytes: content.length,
          source: 'worker_task',
        }
      })
    }
  }

  await supabase.from('company_memos').insert({
    goal_id: goalId || null,
    task_id: task.id,
    from_department: deptRow.name,
    from_department_id: deptRow.id,
    title: `[${task.action}] ${task.label}`,
    body: formatMemoBody(
      artifactUrl
        ? `Output saved as downloadable artifact. See Artifacts section to download.\n\nSummary: ${workerResult.memo_summary}`
        : workerResult.memo_summary
    ),
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
