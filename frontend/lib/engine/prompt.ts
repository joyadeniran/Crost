// lib/engine/prompt.ts
// Prompt-building: buildFinalPrompt (department/orc system prompt assembly),
// plus small orchestrator prompt helpers. Extracted verbatim from
// lib/llm-client.ts during the Phase 2 god-module split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'
import { DEPARTMENT_TOOL_RULES } from '@/lib/tools/execute-tool-call'
import { getMemoBrief, getMemos } from './memo'
import { log } from '@/lib/log'

const DEFAULT_ASSISTANT_IDENTITY = `You are part of Crost's AI operating system.
Write professionally and clearly. Be direct, warm, and human.
Avoid corporate buzzwords. Adapt tone to context: technical when needed, conversational when appropriate.`

function cleanConfigValue(value: unknown): string {
  if (value == null) return ''
  const cleaned = String(value).replace(/^"|"$/g, '').trim()
  return cleaned === 'null' ? '' : cleaned
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

    const identityMap = new Map((identityRows ?? []).map((row: any) => [row.key, cleanConfigValue(row.value)]))
    const founderName = identityMap.get('founder_name') ?? ''
    const companyName = identityMap.get('company_name') ?? ''

    founderIdentity = (identityMap.get('founder_identity') as string) || (founderName ? `Founder: ${founderName}` : '')
    companyIdentity = (identityMap.get('company_identity') as string) || (companyName ? `Company: ${companyName}` : '')
    assistantIdentity = (identityMap.get('assistant_identity') as string) || DEFAULT_ASSISTANT_IDENTITY
    legacyIdentity = (identityMap.get('local_identity') as string) || ''
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
  const permittedTools = (allTools ?? []).filter((t: any) => {
    const service = t.id.split('_')[0].toLowerCase()
    return allowedServices.includes(service) || t.id === 'supabase_query'
  })

  const toolDefinitions = [
    `### INTERNAL TOOLS (Always Available)`,
    `- COMPANY_MEMOS: Fetch recent company communications. Args: { "limit": number }`,
    allowedServices.includes('internal') ? `- KNOWLEDGE_BASE_SEARCH: Search the founder's uploaded knowledge base (documents, reports, handbooks, pitch decks, etc.). Use this whenever the founder references an uploaded file, asks about company documents, or when grounding the response in founder-provided context would help. Args: { "service": "internal", "action": "knowledge_base_search", "query": "<search terms>", "category": "<optional: company_profile|pitch_deck|financial_report|handbook|meeting_notes|research|legal|marketing|sales|product|operations>", "limit": 5 }` : '',
    allowedServices.includes('internal') ? `- KNOWLEDGE_BASE_READ: Fetch the full extracted text content of a specific knowledge base file. Use this after finding a relevant file via search to read its full content. Args: { "service": "internal", "action": "knowledge_base_read", "file_id": "<uuid from search results>" }` : '',
    permittedTools.some((t: any) => t.id === 'supabase_query') ? `- SUPABASE_QUERY: Execute read-only SQL queries against the database schema. Args: { "query": "SELECT ..." }` : '',
    ...permittedTools.filter((t: any) => t.id !== 'supabase_query').map((t: any) => `- ${t.id.toUpperCase()}: ${t.description}`)
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
        .map((m: any) => `[${m.is_foundational ? 'FOUNDATIONAL' : 'CURRENT CONTEXT'}] ${m.title} (from: ${m.from_department})\n${m.body}`)
        .join('\n\n')
      sections.push(`### CORE BUSINESS CONTEXT\n${formatted}`)
    }

    if (criticalMemos && criticalMemos.length > 0) {
      const tier2 = criticalMemos
        .map((m: any) => `[URGENT] ${m.title} (from: ${m.from_department})\n${m.body}`)
        .join('\n\n')
      sections.push(`### CRITICAL MEMOS\n${tier2}`)
    }

    if (highMemos && highMemos.length > 0) {
      const tier3 = highMemos
        .map((m: any) => `[HIGH] ${m.title} (from: ${m.from_department})\n${m.body.slice(0, 500)}`)
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
    log.error('[buildOrcContext] Error', { module: 'engine/prompt', userId, error: String(err) })
    return ''
  }
}

// ─── Orchestrator prompt helpers ──────────────────────────────────────────────

export function getModeInstructions(mode: string): string {
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

export function formatConversationHistory(history: Array<{ role: string; content: string; ts?: string }>): string {
  if (!history.length) return 'None'
  return history
    .slice(-8)
    .map((entry) => `${entry.role.toUpperCase()}: ${entry.content}`)
    .join('\n')
}
