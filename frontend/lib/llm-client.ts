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
import { truncateString, cleanLargePayload, formatMemoBody, normalizeToolName } from './utils'
import { loadSkillsForTask } from './skills'
import { generateAndInsertSuggestedActions } from './suggested-actions'
import { addTaskLog, logDecision, addArtifactReference } from './company-memo'
import { DEPARTMENT_TOOL_RULES } from './tools/execute-tool-call'
import {
  fetchOrcContext,
  seedOrcContextFromMemo,
  formatOrcContextForPrompt,
  enrichWithKnowledgeBase,
  formatKbContextForPrompt,
  orcDecisionGate,
  type OrcDecision,
} from './orc-decision-gate'
import { detectCapabilityGaps, formatCapabilityGapsForPrompt } from './capability-checker'
import { assessGoalRisk } from './risk-assessor'

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
  content: string,
  taskHint?: string
): Promise<{ fileUrl: string; artifactType: 'document' | 'spreadsheet' | 'data'; extension: string; fileSize: number } | null> {
  const supabase = createServerSupabaseClient()

  try {
    // Strip markdown code fences LLMs often wrap JSON in
    const stripped = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    const isJson = (stripped.startsWith('{') && stripped.endsWith('}')) || (stripped.startsWith('[') && stripped.endsWith(']'))

    const detection = detectOutputType(stripped, isJson, taskHint)

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

    // Use taskHint (the task label) for a descriptive filename, fallback to taskId
    const cleanLabel = (taskHint || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50)
    
    const fileName = `goals/${goalId || 'global'}/${cleanLabel}-${Date.now()}.${ext}`

    const { data, error } = await supabase.storage
      .from('artifacts')
      .upload(fileName, fileContent, { contentType, upsert: false })

    if (error || !data) {
      console.error('[uploadArtifact] Storage upload failed:', error)
      return null
    }

    const { data: urlData } = supabase.storage.from('artifacts').getPublicUrl(data.path)
    const fileSize = typeof fileContent === 'string' ? Buffer.byteLength(fileContent, 'utf8') : fileContent.length
    return { fileUrl: urlData.publicUrl, artifactType, extension: ext, fileSize }
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

  // Strategic context from the singular company_memo table (Spec §8)
  let strategicContext = ''
  if (userId) {
    const { data: memo } = await supabase
      .from('company_memo')
      .select('company_profile, active_goals, strategies, decisions')
      .eq('user_id', userId)
      .maybeSingle()
    
    if (memo) {
      const parts: string[] = []
      if (memo.company_profile && Object.keys(memo.company_profile).length > 0) {
        const p = memo.company_profile as any
        parts.push(`COMPANY PROFILE: ${p.name || ''} ${p.industry ? `(${p.industry})` : ''} - ${p.description || ''}`)
      }
      if (memo.decisions && memo.decisions.length > 0) {
        const d = (memo.decisions as any[]).slice(-3).map(dec => `- [${dec.made_by}] ${dec.title}: ${dec.decision}`).join('\n')
        parts.push(`RECENT DECISIONS:\n${d}`)
      }
      strategicContext = parts.join('\n\n')
    }
  }

  const capLine = capabilities.length > 0
    ? `CAPABILITIES\n${capabilities.map(c => `- ${c}`).join('\n')}`
    : ''
  const restLine = restrictions.length > 0
    ? `RESTRICTIONS\n${restrictions.map(r => `- ${r}`).join('\n')}`
    : ''

  // Tool definitions filtered by department-specific permission rules (Spec §11)
  const allowedServices = departmentSlug 
    ? (DEPARTMENT_TOOL_RULES[departmentSlug.toLowerCase()] || DEPARTMENT_TOOL_RULES['executive'])
    : DEPARTMENT_TOOL_RULES['executive']

  const toolsQuery = supabase
    .from('available_tools')
    .select('id, label, description')
    .eq('is_configured', true)

  if (userId) {
    toolsQuery.eq('user_id', userId)
  } else {
    toolsQuery.is('user_id', null)
  }

  // Filter tools to only those the department is authorized to use
  const { data: allTools } = await toolsQuery.or('is_action.eq.true,requires_config.eq.false,id.eq.supabase_query')
  const permittedTools = (allTools ?? []).filter(t => {
    const service = t.id.split('_')[0].toLowerCase()
    return allowedServices.includes(service) || t.id === 'supabase_query'
  })

  const toolDefinitions = [
    `### INTERNAL TOOLS (Always Available)`,
    `- COMPANY_MEMOS: Fetch recent company communications. Args: { "limit": number }`,
    allowedServices.includes('internal') ? `- KNOWLEDGE_BASE_SEARCH: Search the founder's uploaded knowledge base (documents, reports, handbooks, pitch decks, etc.). Use this whenever the founder references an uploaded file, asks about company documents, or when grounding the response in founder-provided context would help. Args: { "service": "internal", "action": "knowledge_base_search", "query": "<search terms>", "category": "<optional: company_profile|pitch_deck|financial_report|handbook|meeting_notes|research|legal|marketing|sales|product|operations>", "limit": 5 }` : '',
    allowedServices.includes('internal') ? `- KNOWLEDGE_BASE_READ: Fetch the full extracted text content of a specific knowledge base file. Use this after finding a relevant file via search to read its full content. Args: { "service": "internal", "action": "knowledge_base_read", "file_id": "<uuid from search results>" }` : '',
    permittedTools.some(t => t.id === 'supabase_query') ? `- SUPABASE_QUERY: Execute read-only SQL queries against the database schema. Args: { "query": "SELECT ..." }` : '',
    ...permittedTools.filter(t => t.id !== 'supabase_query').map(t => `- ${t.id.toUpperCase()}: ${t.description}`)
  ].filter(Boolean).join('\n')

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
  "action_type": "<ACTUAL_TOOL_NAME, e.g. GMAIL_SEND_EMAIL | SLACK_POST_MESSAGE | GITHUB_CREATE_PULL_REQUEST | KNOWLEDGE_BASE_SEARCH>",
  "action_label": "<short human-readable description of what you are about to do>",
  "reasoning": "<why this action is necessary for the task>",
  "payload": { <all parameters needed to execute the action once approved> },
  "context": "<brief context for the founder reviewing this request>"
}

Payload field names for common actions:
- GMAIL_SEND_EMAIL / GMAIL_CREATE_EMAIL_DRAFT: use exactly { "to": "email@example.com", "subject": "...", "body": "..." }
- SLACK_POST_MESSAGE: use exactly { "channel": "#channel-name", "text": "..." }
- GITHUB_CREATE_PULL_REQUEST: use { "title": "...", "body": "...", "head": "...", "base": "..." }

Rules:
- NEVER send an email, post to Slack, push code, or modify external data without outputting REQUEST_APPROVAL first.
- If the task only requires analysis, research, or writing a draft — complete it without REQUEST_APPROVAL.
- Do NOT include any text after the REQUEST_APPROVAL block. It will be parsed automatically.`
    : ''

  const recoveryProtocol = departmentSlug && departmentSlug !== 'orchestrator'
    ? `## RECOVERY & FALLBACK PROTOCOL (Non-negotiable)

1. MISSING DATA (Option C): If you are asked to gather data from the knowledge base, memos, or external tools and it DOES NOT EXIST, do not hallucinate or guess. You MUST return this JSON immediately:
   { "needs_more_data": true, "missing_data": ["description of what is missing"], "summary": "I couldn't find the necessary data to proceed." }

2. TEMPLATE FALLBACK (Option A): If you are drafting a document (report, projection, plan) and upstream data gathering tasks were skipped (indicated by empty context or explicit notes), DO NOT FAIL. Instead, generate a high-quality TEMPLATE or SAMPLE based on industry standards, using placeholders like "[Insert Revenue Data]" or "[Add Marketing Goal]" where data is missing.

3. MISSING CONNECTOR FALLBACK (Option B): If your task requires posting to a social platform, sending via a messaging service, or any Composio-backed tool, and you do not have confirmed access to that integration — DO NOT fail silently or request an approval that can never execute. Instead, complete the task by producing the content as a written draft (document/memo), and include a clear note: "⚠ [Service] integration is not connected. The content has been drafted below for you to post manually or after connecting the integration in Settings → Integrations." Output the draft as your result.`
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
    strategicContext ? `## STRATEGIC CONTEXT (Source of Truth)\n${strategicContext}` : '',
    (capLine || restLine) ? `## CAPABILITY BOUNDARIES\n${[capLine, restLine].filter(Boolean).join('\n\n')}` : '',
    `## AVAILABLE TOOLS\n${toolDefinitions}`,
    recoveryProtocol,
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
  if (!hasSignal) return null

  // Search for the outermost JSON block in the entire response
  const firstBrace = response.indexOf('{')
  const lastBrace = response.lastIndexOf('}')

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    if (response.includes('\nREQUEST_APPROVAL') || response.startsWith('REQUEST_APPROVAL')) {
      return 'BLOCKED'
    }
    return null
  }

  const jsonStr = response.slice(firstBrace, lastBrace + 1)

  try {
    const parsed = JSON.parse(jsonStr) as Partial<ApprovalRequest>
    
    // If it's a wrapped response like {"REQUEST_APPROVAL": {...}}, unwrap it
    const actual = (parsed as any).REQUEST_APPROVAL || parsed

    if (!actual.reasoning || actual.reasoning.trim() === '' || !actual.action_type || !actual.action_label) {
      return null
    }

    return {
      action_type: actual.action_type,
      action_label: actual.action_label,
      reasoning: actual.reasoning,
      payload: actual.payload ?? {},
      context: actual.context ?? '',
    }
  } catch {
    return 'BLOCKED'
  }
}

// ─── Context Compiler ─────────────────────────────────────────────────────────

export async function buildOrcContext(userId: string | null): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const [tier1Res, criticalRes, highRes, optionalRes, structuredRes] = await Promise.all([
      supabase
        .from('company_memos')
        .select('title, body, from_department, priority, is_foundational, is_current_context')
        .or('is_foundational.eq.true,is_current_context.eq.true')
        .order('created_at', { ascending: true }),
      supabase
        .from('company_memos')
        .select('title, body, from_department, priority, confidence, source_type')
        .eq('priority', 'urgent')
        .eq('is_foundational', false)
        .eq('is_current_context', false)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('company_memos')
        .select('title, body, from_department, priority, confidence, source_type')
        .eq('priority', 'high')
        .eq('is_foundational', false)
        .eq('is_current_context', false)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('company_memos')
        .select('title, from_department, priority')
        .in('priority', ['normal', 'low'])
        .eq('is_foundational', false)
        .eq('is_current_context', false)
        .order('created_at', { ascending: false })
        .limit(5),
      // Spec §8 Structured context from the singular company_memo table
      userId ? supabase
        .from('company_memo')
        .select('company_profile, active_goals, strategies, task_logs, decisions, department_notes')
        .eq('user_id', userId)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null })
    ])

    const tier1Memos = tier1Res.data
    const criticalMemos = criticalRes.data
    const highMemos = highRes.data
    const optionalMemos = optionalRes.data
    const structuredMemo = (structuredRes as any)?.data

    const sections: string[] = []

    if (structuredMemo) {
      const parts: string[] = []
      
      if (structuredMemo.company_profile && (structuredMemo.company_profile.name || structuredMemo.company_profile.description)) {
        const p = structuredMemo.company_profile
        parts.push(`COMPANY PROFILE: ${p.name || ''} ${p.industry ? `(${p.industry})` : ''} - ${p.description || ''}`)
      }

      if (structuredMemo.decisions && structuredMemo.decisions.length > 0) {
        const d = (structuredMemo.decisions as any[])
          .slice(-10)
          .map(dec => `- [${dec.made_by}] ${dec.title}: ${dec.decision}`)
          .join('\n')
        parts.push(`### STRATEGIC DECISIONS\n${d}`)
      }

      if (structuredMemo.task_logs && structuredMemo.task_logs.length > 0) {
        const t = (structuredMemo.task_logs as any[])
          .slice(-10)
          .map(log => `- [${log.dept_slug}] ${log.title}: ${log.status}${log.result ? ` (${log.result})` : ''}`)
          .join('\n')
        parts.push(`### RECENT TASK OUTCOMES\n${t}`)
      }

      if (parts.length > 0) {
        sections.push(`### STRATEGIC MEMO (Source of Truth)\n${parts.join('\n\n')}`)
      }
    }

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
        .map((m: any) => `- [${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})\n  Summary: ${m.body.slice(0, 100)}${m.body.length > 100 ? '...' : ''}`)
        .join('\n')
      sections.push(`### RECENT MEMOS\n${tier4}`)
    }

    return sections.join('\n\n')
  } catch (err) {
    console.error('[buildOrcContext] Error:', err)
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

    // DUAL-WRITE: Log as a decision in singular company_memo (§8)
    if (userId) {
      logDecision(supabase, userId, {
        id: crypto.randomUUID(),
        title: 'Founder Clarification',
        context: `Goal ID: ${goalId}`,
        decision: content,
        reasoning: 'Direct founder input provided during orchestration.',
        made_by: 'founder',
        created_at: new Date().toISOString()
      }).catch(() => {})
    }
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
    signal: AbortSignal.timeout(90_000),
  })

  if (!res.ok) {
    const errText = await res.text()
    let cleanMessage = `LiteLLM error ${res.status}`
    try {
      const parsed = JSON.parse(errText)
      // Extract the nested error message from LiteLLM's standard response
      if (parsed.error?.message) {
        cleanMessage = parsed.error.message
      } else if (parsed.message) {
        cleanMessage = parsed.message
      }
    } catch {
      // Not JSON, use technical fallback
    }
    
    // We keep 'LiteLLM error' in the prefix so formatErrorMessage() can still detect it
    throw new Error(`LiteLLM error ${res.status}: ${cleanMessage}`)
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

// ─── Resilient Fallback Logic ────────────────────────────────────────────────

// Canonical fallback chain for high-reliability operations.
// Evaluated in order if the primary model fails.
const RESILIENT_FALLBACK_CHAIN = [
  'groq/llama-3.3-70b-versatile', // Smartest/Fastest (Primary)
  'gemini/gemini-2.0-flash',       // Reliable Backup (Corrected version name)
  'groq/llama-3.1-8b-instant'     // Fast Cloud Fallback (Replaced local/gemma3)
]

export async function callLLM(
  model: string,
  prompt: string,
  systemNote?: string,
  userId?: string | null,
  providerOverride?: string,
  isBootstrap?: boolean
): Promise<{ content: string; tokensUsed: number }> {
  // Start with the requested model
  let currentModel = model
  let attempts = 0
  const maxAttempts = 3

  // Identify if we should use the fallback chain.
  const useFallbackChain = RESILIENT_FALLBACK_CHAIN.includes(model) || model === 'cloud' || !model.startsWith('local')

  while (attempts < maxAttempts) {
    try {
      return await callLiteLLM(currentModel, prompt, systemNote, userId, providerOverride, isBootstrap)
    } catch (err: any) {
      attempts++

      // NEVER retry on system limit exceeded (billing/quota logic)
      if (err.message?.includes('SYSTEM_LIMIT_EXCEEDED')) {
        throw err
      }

      console.warn(`[callLLM] Attempt ${attempts} failed for ${currentModel}:`, err.message)

      if (attempts >= maxAttempts || !useFallbackChain) {
        throw err // Exhausted retries or non-fallbackable model
      }

      // Select the next model in the chain
      const currentIndex = RESILIENT_FALLBACK_CHAIN.indexOf(currentModel)
      let nextModel: string | null = null

      if (currentIndex !== -1 && currentIndex < RESILIENT_FALLBACK_CHAIN.length - 1) {
        nextModel = RESILIENT_FALLBACK_CHAIN[currentIndex + 1]
      } else if (currentIndex === -1 && attempts === 1) {
        nextModel = RESILIENT_FALLBACK_CHAIN[0]
      }

      if (nextModel) {
        const switchDescription = `Automated provider fallback: ${currentModel} failed (Attempt ${attempts}). Switching to ${nextModel}.`
        console.info(`[callLLM] ${switchDescription}`)
        
        // SILENT LOGGING: Log to event_log for transparency without interrupting the user
        logEvent({
          event_type: 'provider_fallback',
          description: switchDescription,
          model_used: currentModel,
          metadata: { 
            failed_model: currentModel, 
            next_model: nextModel, 
            attempt: attempts,
            error: err.message?.slice(0, 500)
          },
          created_by: userId
        }).catch(() => {})

        currentModel = nextModel
      } else {
        throw err // No more fallback options
      }
    }
  }

  throw new Error('LLM call failed after multiple fallback attempts.')
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

    // Per-user per-day system token usage (resets at local midnight)
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)

    const { data: usage } = await supabase
      .from('api_usage_logs')
      .select('total_tokens')
      .eq('user_id', userId)
      .eq('key_type', 'system')
      .gte('created_at', todayMidnight.toISOString())

    const tokensUsed = (usage ?? []).reduce((sum, row) => sum + (row.total_tokens ?? 0), 0)

    if (tokensUsed >= limit) {
      // Reset time: next midnight local
      const resetAt = new Date(todayMidnight)
      resetAt.setDate(resetAt.getDate() + 1)
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
  error_code?: string | null
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
      error_code: input.error_code ?? null,
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
  "is_direct_response": boolean,
  "direct_response": "string or null — use ONLY if is_direct_response is true",
  "clarification_question": "string or null — use ONLY if is_valid_goal is false",
  "response_mode": "assistant|clarify|quick_plan|full_plan|direct_action|command|escalate — confirm or override the pre-classifier hint",
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
        "expected_deliverable": "description of what this task produces",
        "params": { "key": "value" },
        "risk_level": "low | medium | high | critical",
        "depends_on": ["uuid_of_blocker_task"],
        "model": "cloud | local"
      }
    ]
  }
}

Rules:
1. COMPLEX GOALS: If the goal requires substantive work that a department agent should produce (a real document, campaign, codebase, research report, etc.) set is_valid_goal=true and is_direct_response=false and provide a plan.
2. CONVERSATIONAL QUERIES & TRIVIAL TASKS: Use is_direct_response=true for: (a) simple questions about capabilities, company state, or help ("Who are you?", "What can you do?", "What is our mission?"); (b) tiny self-contained requests answerable in a few sentences ("Write hello world HTML", "Give me a sample subject line", "Translate this word"); (c) any request where the complete answer fits in a single direct_response without needing a department agent. DO NOT draft a multi-task plan for these.
3. PLANNING THRESHOLD: Reserve Planning Mode (is_direct_response=false) for goals that genuinely need one or more department agents to do meaningful work — a real deliverable, a real action (send email, post content, run research), or coordination across multiple steps. The presence of action verbs alone ("write", "create", "build", "make") does NOT force Planning Mode if the task is trivially small. Apply judgment: "Write hello world HTML" → direct response; "Write a full email marketing campaign targeting SMBs" → plan.
4. ASSUMPTION OVER INTERROGATION: Do not ask pedantic clarification questions for common abbreviations, social platforms, or standard business terms (e.g., assuming "X" = Twitter, "Insta" = Instagram, "Deck" = Pitch Deck). Make the industry-standard assumption, proceed with the plan, and explicitly document your assumption in the plan's risk_note.
5. AMBIGUOUS GOALS: If the goal is truly non-sensical or critically ambiguous, set is_valid_goal=false and provide a clarification_question.
6. NEVER provide both a plan and a direct_response.
7. ALWAYS provide a risk_note in the plan.
8. You MUST ONLY assign tasks to the PROVIDED list of departments in the "Available Departments" section. Do NOT hallucinate or create new departments.
9. CAPABILITY AWARENESS: You must look end-to-end at the requested goal. NEVER fail silently or attempt to hire external freelancers to bypass missing capabilities. Solo founders use Crost to avoid external costs.
10. SELF-INTRODUCTION: If asked "Who are you?", explain: "I am Orc (short for Orchestrator), your AI Chief of Staff."
11. RESPONSE MODE: A pre-classifier has suggested a response_mode (see ORCHESTRATOR MODE HINT in the prompt). Confirm it in your response_mode field, or override it if your analysis of the full context disagrees. This field is optional but strongly preferred.`

function getModeInstructions(mode: string): string {
  switch (mode) {
    case 'assistant':
      return 'Set is_direct_response=true. Answer directly from context — concise, specific, warm. End with 2-3 concrete suggested next steps embedded in your direct_response text.'
    case 'direct_action':
      return 'Set is_direct_response=true for read-only actions. For write actions (send, post, create), set is_valid_goal=true with exactly 1 task that triggers HITL approval. No multi-task plan — this is a single atomic action.'
    case 'clarify':
      return 'Set is_valid_goal=false. Write clarification_question as 1-2 focused conversational questions in prose — not a form, not bullet points, not multiple choice. State your reasonable assumptions first ("I\'m assuming X based on Y"). Then ask only what would materially change the plan. Keep it under 4 sentences total.'
    case 'quick_plan':
      return 'Generate a focused plan of 3-5 tasks maximum. Prefer parallel execution (minimal depends_on). All tasks should have risk_level "low" or "medium". Avoid over-engineering. Assume reasonable defaults and document them in risk_note rather than asking.'
    case 'full_plan':
      return 'This is a complex strategic goal. Generate a thorough plan with 5-15 tasks. Establish clear task dependencies. Organize tasks into logical phases in the risk_note. Surface all risks, resource needs, and timeline estimates in risk_note.'
    case 'command':
      return 'Set is_direct_response=true. Execute or acknowledge the command. Confirm what was done or provide the requested system information. Be brief.'
    case 'escalate':
      return 'Set is_direct_response=true. The goal may exceed current capabilities. Do NOT attempt to plan something that cannot be delivered. Instead, explain clearly what CAN be done internally, and offer 2-3 concrete alternative approaches in direct_response.'
    default:
      return ''
  }
}

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
        t.depends_on = (t.depends_on ?? [])
          .map((depId: string) => idMap.get(depId) ?? depId)
          .filter((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
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

  // Step 1: Inject recent tasks to handle meta-commands like "Retry the last task"
  const { data: recentTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, label, status, dept_slug, goal_id, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  const formattedRecentTasks = (recentTasks || [])
    .map(t => `- [${t.status.toUpperCase()}] ${t.label} (task_id: ${t.task_id}, goal_id: ${t.goal_id}, Dept: ${t.dept_slug})`)
    .join('\n')

  // Brains 1 + 3: parallel fetch of memo context, structured Orc context, capability
  // inventory, and KB enrichment — all fail-open so nothing blocks goal dispatch.
  const [systemMemory, orcContext, capSummary, kbMatches] = await Promise.all([
    buildOrcContext(userId),
    fetchOrcContext(userId),
    detectCapabilityGaps(founderInput),
    enrichWithKnowledgeBase(founderInput, userId),
  ])

  // Fire-and-forget auto-seed from company_memo on first run
  if (userId) seedOrcContextFromMemo(userId).catch(() => {})

  // Risk assessment (synchronous — uses data already fetched above)
  const riskAssessment = assessGoalRisk(founderInput, orcContext, capSummary.gaps)

  // Brain 2: classify intent, injecting pre-computed risk notes so the classifier
  // has full context before choosing a response mode.
  const decision = await orcDecisionGate(founderInput, orcContext, conversationHistory, riskAssessment.risk_notes)

  const orcContextSummary = formatOrcContextForPrompt(orcContext)
  const capabilityGapsText = formatCapabilityGapsForPrompt(capSummary)
  const kbContextText = formatKbContextForPrompt(kbMatches)
  const modeInstructions = getModeInstructions(decision.mode)
  const modeHint = [
    `ORCHESTRATOR MODE HINT (pre-classified): ${decision.mode} (confidence: ${decision.confidence.toFixed(2)})`,
    `Reasoning: ${decision.reasoning}`,
    decision.risk_notes.length > 0 ? `Risk flags: ${decision.risk_notes.join('; ')}` : '',
    riskAssessment.assumptions.length > 0 ? `Assumptions: ${riskAssessment.assumptions.join('; ')}` : '',
    modeInstructions ? `Mode instructions: ${modeInstructions}` : '',
  ].filter(Boolean).join('\n')

  const conversationContext = formatConversationHistory(conversationHistory)
  const prompt = [
    `GOAL: ${founderInput}`,
    forcePlan ? 'FORCE PLANNING MODE: The founder has explicitly bypassed clarification and trusts your judgment. You MUST draft the best possible plan now using reasonable assumptions and all available context (System Memory/Memos/KB). DO NOT return is_valid_goal=false. You are authorized to proceed with partial context.' : '',
    modeHint,
    capabilityGapsText ? `Capability Intelligence:\n${capabilityGapsText}` : '',
    kbContextText      ? `Knowledge Base Context:\n${kbContextText}` : '',
    `Available Departments: ${activeDeptsList.map(d => d.slug).join(', ')}`,
    formattedRecentTasks ? `Recent Workspace Tasks:\n${formattedRecentTasks}` : '',
    `Conversation History:\n${conversationContext}`,
    orcContextSummary ? `Structured Company Context:\n${orcContextSummary}` : '',
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

  // ─── Hallucination Protection ──────────────────────────────────────────────
  // Validate that all proposed departments actually exist in the DB.
  if (result.is_valid_goal && result.plan?.tasks) {
    const activeSlugs = activeDeptsList.map(d => d.slug.toLowerCase())
    const invalidTasks = result.plan.tasks.filter((t: any) => !activeSlugs.includes(t.dept.toLowerCase()))
    
    if (invalidTasks.length > 0) {
      console.warn(`[Orchestrator] Hallucination detected: Unknown departments [${invalidTasks.map((t: any) => t.dept).join(', ')}]. Forcing retry...`)
      
      const retryPrompt = `${prompt}\n\nCRITICAL ERROR: You proposed tasks for departments that do NOT exist: [${invalidTasks.map((t: any) => t.dept).join(', ')}]. \nONLY use these available departments: [${activeSlugs.join(', ')}]. \nRedraft the plan using ONLY these departments.`
      
      const retryResponse = await callLLM(planModel, await buildFinalPrompt(
        orcDept?.persona_prompt ?? 'You are the Orchestrator.',
        retryPrompt,
        orcDept?.capabilities ?? [],
        orcDept?.restrictions ?? [],
        orcDept?.slug,
        goalId
      ), ORCHESTRATOR_SYSTEM_NOTE, userId, planProvider)
      
      result = parseOrchestratorResponse(retryResponse.content)
      
      // Secondary validation check — if still invalid after one retry, mark goal as error
      // rather than leaving it stuck in 'planning' forever (HIGH-1 fix).
      const secondaryInvalid = (result.plan?.tasks || []).filter((t: any) => !activeSlugs.includes(t.dept.toLowerCase()))
      if (secondaryInvalid.length > 0) {
        const badDepts = secondaryInvalid.map((t: any) => t.dept).join(', ')
        await supabase.from('goals').update({
          status: 'error',
          orc_notes: `Orchestrator repeatedly proposed invalid departments after retry: [${badDepts}]. Available: [${activeSlugs.join(', ')}].`,
        }).eq('id', goalId)
        throw new Error(`Orchestrator failed to respect department boundaries after retry. Proposed unknown depts: ${badDepts}`)
      }
    }
  }

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

  // Persist the pre-classifier decision regardless of which branch we take below
  const orcDecisionPayload: OrcDecision = result.response_mode
    ? { ...decision, mode: result.response_mode } // LLM overrode the pre-classifier
    : decision
  await supabase.from('goals').update({
    response_mode: orcDecisionPayload.mode,
    orc_decision: {
      mode:             orcDecisionPayload.mode,
      confidence:       orcDecisionPayload.confidence,
      reasoning:        orcDecisionPayload.reasoning,
      risk_notes:       orcDecisionPayload.risk_notes,
    },
  }).eq('id', goalId)

  // Record in decision log for the self-improvement loop (fire-and-forget)
  if (userId) {
    supabase.from('orc_decision_log').insert({
      user_id:         userId,
      goal_id:         goalId,
      decision_type:   'response_mode_selection',
      founder_intent:  founderInput.slice(0, 500),
      orc_choice:      orcDecisionPayload.mode,
      confidence:      orcDecisionPayload.confidence,
      assumptions:     { list: riskAssessment.assumptions },
      risk_tier:       riskAssessment.tier,
      risk_notes:      orcDecisionPayload.risk_notes,
      capability_gaps: capSummary.gaps.map(g => ({ slug: g.slug, name: g.name, availability: g.availability })),
    }).then(() => {}).catch(() => {})
  }

  if (result.is_valid_goal === false) {
    const updatedHistory = [...conversationHistory, { role: 'assistant', content: result.clarification_question, ts: new Date().toISOString() }]
    await supabase.from('goals').update({ status: 'clarifying', orc_conversation: updatedHistory }).eq('id', goalId)
    return result
  }

  // Case 2: Direct Response (Assistant mode)
  if (result.is_direct_response === true) {
    const directResponse = result.direct_response || 'I have processed your request.'
    const updatedHistory = [...conversationHistory, { role: 'assistant', content: directResponse, ts: new Date().toISOString() }]

    await supabase.from('goals').update({
      status: 'completed',
      outcome: directResponse,
      orc_conversation: updatedHistory
    }).eq('id', goalId)

    // Also create a memo so it shows up in the UI (SynthesisReportCard)
    await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'Orchestrator',
      title: `[DIRECT RESPONSE] ${founderInput.slice(0, 50) || 'Assistant Action'}`,
      body: directResponse,
      priority: 'normal',
      source_type: 'orchestrator',
      created_by: userId
    })

    await logEvent({
      event_type: 'goal_completed',
      department_slug: 'orchestrator',
      goal_id: goalId,
      description: `Direct response provided: "${directResponse.slice(0, 100)}..."`,
      tokens_used: tokensUsed,
      created_by: userId,
      metadata: { direct_response: directResponse }
    })

    return result
  }

  const { plan } = result
  if (!plan) {
    throw new Error('Orchestrator proposed a valid goal but failed to provide a plan.')
  }
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

  // Wrap execution in try/catch so department status is always reset, even on LLM errors.
  try {
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
    // action_type is constrained to a fixed enum (see approval_queue_action_type_check).
    // Worker-issued REQUEST_APPROVAL blocks emit raw tool names like GMAIL_SEND_EMAIL,
    // which are not in the enum. Always store 'tool_call' and stash the real
    // composio action in payload.__tool_action — the PATCH executor reads it from
    // there. The original action name is preserved as action_label for UI.
    const { error: aqInsertErr } = await supabase.from('approval_queue').insert({
      department_id: deptRow.id,
      department_name: deptRow.name,
      department_slug: dept,
      action_type: 'tool_call',
      action_label: approvalRequest.action_label || approvalRequest.action_type,
      reasoning: approvalRequest.reasoning,
      payload: { ...approvalRequest.payload, __task_id: task.id, __tool_action: normalizeToolName(approvalRequest.action_type) },
      context: approvalRequest.context,
      risk_level: 'medium',
      goal_id: goalId ?? null,
      user_id: userId,
      status: 'pending',
      created_by: userId
    })
    if (aqInsertErr) {
      console.error('[runWorkerTask] approval_queue insert failed:', aqInsertErr.message, aqInsertErr.details)
      throw new Error(`Failed to create approval request: ${aqInsertErr.message}`)
    }
    await supabase.from('departments').update({ status: 'awaiting_approval' }).eq('id', deptRow.id)
    // Mirror the event that executeToolCall emits for Composio-path approvals
    await supabase.from('event_log').insert({
      department_id: deptRow.id,
      department_slug: dept,
      goal_id: goalId ?? null,
      event_type: 'approval_requested',
      description: `Approval requested: ${approvalRequest.action_label || approvalRequest.action_type}`,
      metadata: { action_type: approvalRequest.action_type, reasoning: approvalRequest.reasoning, task_id: task.id },
      created_by: userId
    }).then(({ error }) => { if (error) console.warn('[runWorkerTask] approval_requested event_log insert failed:', error.message) })
    return { task_id: task.id, status: 'needs_approval', result: {}, memo_summary: '', errors: [] }
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  let workerResult: WorkerResult = { task_id: task.id, status: 'completed', result: { raw: content }, memo_summary: content.slice(0, 200), errors: [] }

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      workerResult.status = parsed.needs_more_data ? 'needs_data' : (parsed.status === 'failed' ? 'failed' : 'completed')
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
    const uploaded = await uploadArtifact(goalId || null, task.id, dept, content, task.action)
    if (uploaded) {
      artifactUrl = uploaded.fileUrl
      const { data: newArtifact } = await supabase.from('artifacts').insert({
        goal_id: goalId || null,
        created_by: userId,
        department_slug: dept,
        department_id: deptRow.id,
        artifact_type: uploaded.artifactType,
        title: `Output: ${task.label}`,
        file_url: uploaded.fileUrl,
        file_size: uploaded.fileSize,
        task_id: task.id,
        skills_used: loadedSkillSlugs,
        // Sandbox: worker artifacts land in 'draft' until founder reviews
        status: 'draft',
        version: 1,
        sources: {
          memo_ids: Array.from(new Set([...((workerResult.result as any)?.sources?.memo_ids || [])])),
          kb_file_ids: Array.from(new Set([...((workerResult.result as any)?.sources?.kb_file_ids || [])])),
          tool_calls: (workerResult.result as any)?.sources?.tool_calls || [],
        },
        metadata: {
          task_id: task.id,
          action: task.action,
          extension: uploaded.extension,
          sizeBytes: uploaded.fileSize,
          source: 'worker_task',
        }
      }).select('id').single()

      if (newArtifact) {
        // Spec §6.1 Generate Suggested Next Actions for this Artefact
        const actionIds = await generateAndInsertSuggestedActions({
          source_entity_type: 'artifact',
          source_entity_id: newArtifact.id,
          goal_id: goalId,
          artifact_type: uploaded.artifactType,
          file_url: uploaded.fileUrl,
          artifact_title: `Output: ${task.label}`,
          created_by: userId
        })
        if (actionIds.length > 0) {
          await supabase.from('artifacts').update({ suggested_actions: actionIds }).eq('id', newArtifact.id)
        }
      }
    }
  }

  // Update task status FIRST — resilient against memo insert failures.
  const updatePayload: any = { status: workerResult.status, completed_at: new Date().toISOString() }
  
  if (workerResult.status === 'needs_data') {
    const parsed = workerResult.result as any;
    let noteText = 'The department requires more context or data to execute this task.';
    
    if (Array.isArray(parsed.missing_data) && parsed.missing_data.length > 0) {
      noteText = parsed.missing_data.join(', ');
    } else if (typeof parsed.missing_data === 'string' && parsed.missing_data.trim() !== '') {
      noteText = parsed.missing_data;
    } else if (parsed.summary && typeof parsed.summary === 'string' && parsed.summary.trim() !== '') {
      noteText = parsed.summary;
    }
    
    // Fetch existing notes to append
    const { data: existingTask } = await supabase.from('goal_tasks').select('orc_notes').eq('task_id', task.id).single()
    const existingNotes = existingTask?.orc_notes || []
    
    updatePayload.orc_notes = [
      ...existingNotes,
      { ts: new Date().toISOString(), note: noteText, action_taken: 'BLOCKED_AWAITING_DATA' }
    ]
  }

  await supabase.from('goal_tasks').update(updatePayload).eq('task_id', task.id)
  await supabase.from('departments').update({ status: 'idle', current_task: null }).eq('id', deptRow.id)

  // Memo insert is non-critical — log failure but never block task completion.
  try {
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

    // DUAL-WRITE: Add to singular company_memo task_logs (§8)
    // Awaited inside this try block so failures surface to the catch below (HIGH-2 fix).
    if (userId) {
      await addTaskLog(supabase, userId, {
        id: task.id,
        goal_id: goalId || '',
        dept_slug: dept,
        title: task.label,
        status: workerResult.status === 'completed' ? 'completed' : 'failed',
        result: workerResult.memo_summary,
        artifact_id: artifactUrl ? 'attached' : null,
        created_at: new Date().toISOString()
      })
    }
  } catch (memoErr) {
    console.error('[runWorkerTask] Memo insert failed (non-fatal):', memoErr)
    // Surface to event_log so the founder can see if memory writes are degraded.
    logEvent({
      event_type: 'error',
      description: 'CR-DB-MEMO: task log write failed — strategic memory may be incomplete.',
      error_code: 'CR-DB-MEMO',
      goal_id: goalId ?? null,
      created_by: userId,
    }).catch(() => {})
  }

  // Chain Reaction: if all tasks are terminal, synthesize and auto-complete the goal.
  if (goalId) {
    const { data: allTasks } = await supabase.from('goal_tasks').select('status').eq('goal_id', goalId)
    const terminalStatuses = new Set(['completed', 'failed', 'rejected', 'expired'])
    const allTerminal = (allTasks || []).every(t => terminalStatuses.has(t.status))
    if (allTerminal) {
      await runOrcReport(goalId)
      await supabase.from('goals').update({ status: 'completed' }).eq('id', goalId)
    }
  }

  // Non-exception failure guard: catches cases where the LLM worker explicitly
  // returns status='failed' or a terminal-error status, without throwing.
  // These bypass the catch block but still need event_log + memo observability.
  const TERMINAL_ERROR_STATUSES = new Set(['failed'])
  if (TERMINAL_ERROR_STATUSES.has(workerResult.status)) {
    const failReason = workerResult.errors?.join('; ') || workerResult.memo_summary || 'Worker returned failure status without exception'
    console.error(`[runWorkerTask] Worker returned failure status for task ${task.id}:`, failReason)

    try {
      await supabase.from('event_log').insert({
        department_slug: deptRow.slug,
        goal_id: goalId || null,
        event_type: 'task_failed',
        description: `Worker task failed: ${task.label}`,
        metadata: {
          task_id: task.id,
          action: task.action,
          error: failReason,
          source: 'non_exception_return',
        },
        created_by: userId,
      })

      await supabase.from('company_memos').insert({
        goal_id: goalId || null,
        task_id: task.id,
        from_department: 'system',
        title: `Execution Failed: ${task.label}`,
        body: `Worker returned a failure result:\n\n${failReason}`,
        priority: 'high',
        source_type: 'system',
        created_by: userId,
      })
    } catch (dbErr) {
      console.error('[runWorkerTask] Non-exception failure observability write failed:', dbErr)
    }
  }

  return workerResult
  } catch (workerErr: any) {
    // Step 3: Hardened Exception Handling — prevent silent stalls
    const errorMsg = workerErr.message || String(workerErr)
    console.error(`[runWorkerTask] CRITICAL FAILURE for task ${task.id}:`, errorMsg)

    try {
      // 1. Force the goal_tasks status to 'failed' so the UI/Orc knows it's dead
      await supabase.from('goal_tasks').update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        orc_notes: [{ ts: new Date().toISOString(), note: `Critical execution error: ${errorMsg}`, action_taken: 'SYSTEM_ERROR' }]
      }).eq('task_id', task.id)

      // 2. Emit task_failed to event_log so the UI, Chain Reaction, and Orc can react
      await supabase.from('event_log').insert({
        department_slug: deptRow.slug,
        goal_id: goalId || null,
        event_type: 'task_failed',
        description: `Worker task failed: ${task.label}`,
        metadata: {
          task_id: task.id,
          action: task.action,
          error: errorMsg,
        },
        created_by: userId,
      })

      // 3. Write a system memo so there's a paper trail for the Orchestrator
      await supabase.from('company_memos').insert({
        goal_id: goalId || null,
        task_id: task.id,
        from_department: 'system',
        title: `Execution Failed: ${task.label}`,
        body: `Critical error during execution of [${task.action}]:\n\n${errorMsg}\n\nStack trace logged to server console.`,
        priority: 'high',
        source_type: 'system',
        created_by: userId
      })

      // 3. Reset department status to 'error'
      await supabase.from('departments').update({ status: 'error', current_task: null }).eq('id', deptRow.id)
    } catch (dbErr) {
      console.error('[runWorkerTask] Emergency DB update failed:', dbErr)
    }

    throw workerErr
  }
}

// ─── Orc Synthesis Report ───────────────────────────────────────────────────

export async function runOrcReport(goalId: string): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
  if (!goal) return

  // Idempotency: skip if a Mission Report already exists for this goal.
  // Match both current prefix '[Mission Report]' and legacy '[ORC REPORT]' so stale rows
  // from before the rename are still detected and don't trigger a duplicate.
  const { data: existingReport } = await supabase
    .from('company_memos')
    .select('id')
    .eq('goal_id', goalId)
    .or('title.ilike.[Mission Report]%,title.ilike.[ORC REPORT]%')
    .maybeSingle()
  if (existingReport) return

  const { data: memos } = await supabase.from('company_memos').select('*').eq('goal_id', goalId)
  if (!memos || memos.length === 0) return

  const context = memos.map(m => `### [${m.from_department}] ${m.title}\n${m.body}`).join('\n\n')
  const prompt = `Goal: ${goal.founder_input}\n\nDepartment findings:\n${context}\n\nWrite a concise mission debrief. Use ## markdown headers (not **bold** pseudo-headers). Lead with the outcome, then key findings, then what's next. No preamble, no "I am pleased to present". Be direct and specific.`

  try {
    const { model: reportModel } = await getModel('summarization', goal.created_by)
    const { content } = await callLLM(reportModel, prompt, "You are Orc, a sharp Chief of Staff. Write concise, direct mission debriefs in clean markdown. Use ## and ### headers for sections. No ceremonial language. Get straight to the point.", goal.created_by)
    const { data: newReport } = await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'Orchestrator',
      title: `[Mission Report] ${goal.title}`,
      body: content,
      priority: 'high',
      source_type: 'orchestrator',
      created_by: goal.created_by
    }).select('id').single()

    if (newReport) {
      // DUAL-WRITE: Log as a strategic decision in singular company_memo (§8)
      if (goal.created_by) {
        logDecision(supabase, goal.created_by, {
          id: newReport.id,
          title: `Mission Outcome: ${goal.title}`,
          context: goal.founder_input,
          decision: content.slice(0, 1000), // Summarized version for decision log
          reasoning: 'Strategic synthesis generated by Orc after department execution.',
          made_by: 'orc',
          created_at: new Date().toISOString()
        }).catch(() => {})
      }

      // Spec §6.1 Generate Suggested Next Actions for this Mission Report
      await generateAndInsertSuggestedActions({
        source_entity_type: 'mission_report',
        source_entity_id: newReport.id,
        goal_id: goalId,
        created_by: goal.created_by
      })

      // Spec §7 — emit the canonical event so the live events panel reflects completion
      await logEvent({
        event_type: 'goal_mission_report_written',
        department_slug: 'orchestrator',
        goal_id: goalId,
        description: `Mission Report written for goal: "${goal.title}"`,
        created_by: goal.created_by,
      })
    }
  } catch (err) {
    console.error('[runOrcReport] Failed:', err)
  }
}
