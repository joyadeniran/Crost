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

// ─── Config ───────────────────────────────────────────────────────────────────

const ONYX_API_URL = process.env.ONYX_API_URL ?? 'http://localhost:8080'
const ONYX_API_KEY = process.env.ONYX_API_KEY ?? ''

// llama-3.3-70b-versatile: 128k context, better instruction following than llama3-70b-8192
const CLOUD_MODEL = process.env.CLOUD_MODEL ?? 'groq/llama-3.3-70b-versatile'
const CLOUD_MODEL_WORKER = process.env.CLOUD_MODEL_WORKER ?? 'groq/llama-3.3-70b-versatile'
const LITELLM_URL = process.env.LITELLM_URL ?? 'http://localhost:4000'
const LITELLM_KEY = process.env.LITELLM_KEY ?? process.env.GEMINI_API_KEY ?? ''

// Default fallback tone when local_identity not yet set
const DEFAULT_LOCAL_IDENTITY = `Write professionally and clearly. Be direct, warm, and human.
Avoid corporate buzzwords. Adapt tone to context: technical when needed, conversational when appropriate.`

// ─── Approval signal regex ────────────────────────────────────────────────────

const APPROVAL_REGEX = /REQUEST_APPROVAL:\s*(\{[\s\S]*?\})/

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
  departmentSlug?: string
): Promise<string> {
  const supabase = createServerSupabaseClient()

  const [{ data: constitutionRow }, { data: identityRow }] = await Promise.all([
    supabase.from('system_config').select('value').eq('key', 'agent_constitution').single(),
    supabase.from('system_config').select('value').eq('key', 'local_identity').single(),
  ])

  const constitution = constitutionRow?.value
    ? String(constitutionRow.value).replace(/^"|"$/g, '')
    : ''

  const localIdentity = identityRow?.value && identityRow.value !== 'null'
    ? String(identityRow.value).replace(/^"|"$/g, '')
    : DEFAULT_LOCAL_IDENTITY

  // Memo brief — always fresh, never cached
  const memoBrief = departmentSlug ? await getMemoBrief(departmentSlug) : ''

  const capLine = capabilities.length > 0
    ? `CAPABILITIES\n${capabilities.map(c => `- ${c}`).join('\n')}`
    : ''
  const restLine = restrictions.length > 0
    ? `RESTRICTIONS\n${restrictions.map(r => `- ${r}`).join('\n')}`
    : ''

  return [
    `## CROST CONSTITUTION (Non-negotiable)\n${constitution}`,
    `## YOUR ROLE\n${departmentPrompt}`,
    `## LOCAL IDENTITY\n${localIdentity}`,
    (capLine || restLine) ? `## CAPABILITY BOUNDARIES\n${[capLine, restLine].filter(Boolean).join('\n\n')}` : '',
    memoBrief ? `## COMPANY MEMOS (recent, high priority)\n${memoBrief}` : '',
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
export function parseApprovalRequest(response: string): ApprovalRequest | null {
  const match = response.match(APPROVAL_REGEX)
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
    console.warn('[parseApprovalRequest] Failed to parse JSON from agent response')
    return null
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
    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department')
      .in('priority', ['high', 'urgent'])
      .not('read_by', 'cs', `{${departmentSlug}}`)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!memos || memos.length === 0) return ''

    return memos
      .map(m => `[${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})\n${m.body.slice(0, 200)}`)
      .join('\n\n')
  } catch {
    return '' // non-fatal
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

async function callLLM(
  model: string,
  prompt: string,
  systemNote?: string
): Promise<{ content: string; tokensUsed: number }> {
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


// ─── Orchestrator ─────────────────────────────────────────────────────────────

const ORCHESTRATOR_SYSTEM_NOTE = `You MUST respond with valid JSON only. No prose before or after. No markdown code blocks. Raw JSON only.

Your response must match this schema exactly:

{
  "goal": "the founder's original input verbatim",
  "risk_note": "one sentence mandatory risk assessment — NEVER null or empty",
  "data_gathered": {
    "sales": "summary of sales data, or null",
    "marketing": "summary of marketing data, or null",
    "ops": "summary of ops data, or null"
  },
  "tasks": [
    {
      "id": "uuid-v4",
      "dept": "sales",
      "action": "snake_case_action_name",
      "label": "Human readable label shown to founder",
      "reasoning": "Why this task serves the goal — NEVER null or empty",
      "params": {},
      "risk_level": "low",
      "model": "groq/llama-3.3-70b-versatile",
      "depends_on": []
    }
  ]
}

FIELD RULES:
- "dept" must be exactly one of: "sales", "marketing", "ops" — no other values
- "risk_level" must be exactly one of: "low", "medium", "high", "critical"
- "risk_note" must be a non-empty string — never null
- "reasoning" on every task must be a non-empty string — never null
- "params" must be an object — never null
- "depends_on" must be an array — empty array if no dependencies`

/**
 * Validates the orchestrator's JSON output against the spec schema.
 * Returns null if invalid — caller must handle gracefully.
 */
type ParseResult =
  | { ok: true; plan: OrchestratorPlan }
  | { ok: false; reason: string; rawPreview: string }

function parseOrchestratorResponse(raw: string): ParseResult {
  // Strategy 1: try the full response as JSON (ideal case — model followed instructions)
  // Strategy 2: extract the first {...} block (handles prose before/after JSON)
  // Strategy 3: strip markdown fences anywhere in the string and re-try
  let jsonStr = raw.trim()

  // Strip markdown code fences anywhere (not just at start)
  jsonStr = jsonStr.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()

  // If it still doesn't start with {, find the first { ... }
  if (!jsonStr.startsWith('{')) {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }
  }

  let parsed: Partial<OrchestratorPlan> & { tasks?: Partial<OrchestratorTask>[] }
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    const preview = raw.slice(0, 400)
    console.error('[parseOrchestratorResponse] JSON parse failed. Raw preview:', preview)
    return { ok: false, reason: `JSON parse failed. Model response: ${preview}`, rawPreview: preview }
  }

  if (!parsed.risk_note || parsed.risk_note.trim() === '') {
    return { ok: false, reason: 'risk_note is missing or empty', rawPreview: jsonStr.slice(0, 200) }
  }

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    return { ok: false, reason: 'tasks array is missing or empty', rawPreview: jsonStr.slice(0, 200) }
  }

  const validDepts: WorkerDept[] = ['sales', 'marketing', 'ops']
  const validRisks = ['low', 'medium', 'high', 'critical']

  for (const t of parsed.tasks) {
    // Normalise common field-name variations the model might use
    const raw = t as unknown as Record<string, unknown>
    if (!t.dept) {
      // "department", "departments", "department_slug", "team"
      t.dept = (raw.department ?? raw.department_slug ?? raw.team ?? raw.worker ?? '') as WorkerDept
    }
    if (!t.action)     t.action     = String(raw.action_type ?? raw.task_action ?? raw.type ?? '')
    if (!t.label)      t.label      = String(raw.title ?? raw.name ?? raw.description ?? t.action)
    if (!t.reasoning)  t.reasoning  = String(raw.rationale ?? raw.justification ?? raw.reason ?? '')
    if (!t.risk_level) t.risk_level = String(raw.risk ?? raw.priority ?? 'medium') as typeof t.risk_level

    // Normalise dept to lowercase
    if (typeof t.dept === 'string') t.dept = t.dept.toLowerCase() as WorkerDept

    // Auto-fill missing reasoning rather than rejecting the whole plan
    if (!t.reasoning || t.reasoning.trim() === '') {
      t.reasoning = `Task assigned to ${t.dept || 'department'} as part of the plan.`
    }

    if (!t.dept || !validDepts.includes(t.dept as WorkerDept)) {
      return { ok: false, reason: `Task has invalid dept: "${t.dept}". Must be sales, marketing, or ops.`, rawPreview: jsonStr.slice(0, 200) }
    }

    // Auto-fix invalid risk levels
    if (!validRisks.includes(t.risk_level as string)) {
      t.risk_level = 'medium'
    }

    if (!t.id)         t.id         = crypto.randomUUID()
    if (!t.params)     t.params     = {}
    if (!t.depends_on) t.depends_on = []
    if (!t.model)      t.model      = CLOUD_MODEL
  }

  return {
    ok: true,
    plan: {
      goal: parsed.goal ?? '',
      risk_note: parsed.risk_note,
      data_gathered: parsed.data_gathered ?? { sales: null, marketing: null, ops: null },
      tasks: parsed.tasks as OrchestratorTask[],
    },
  }
}

/**
 * Runs the orchestrator against a founder's goal.
 * Returns a validated OrchestratorPlan or throws on failure.
 */
export async function runOrchestratorTask(
  founderInput: string,
  goalId: string
): Promise<OrchestratorPlan> {
  const supabase = createServerSupabaseClient()

  // Fetch orchestrator persona prompt from departments table
  const { data: orchestratorDept } = await supabase
    .from('departments')
    .select('persona_prompt, capabilities, restrictions, slug')
    .eq('is_orchestrator', true)
    .single()

  const personaPrompt = orchestratorDept?.persona_prompt
    ?? `You are the Orchestrator. Your job is to decompose the founder's goal into a structured JSON plan for the Sales, Marketing, and Ops departments.`

  const prompt = await buildFinalPrompt(
    personaPrompt,
    founderInput,
    orchestratorDept?.capabilities ?? [],
    orchestratorDept?.restrictions ?? [],
    orchestratorDept?.slug
  )

  await logEvent({
    event_type: 'task_started',
    department_slug: 'orchestrator',
    goal_id: goalId,
    description: `Orchestrator planning: "${founderInput.slice(0, 80)}"`,
    metadata: { goal_id: goalId },
  })

  // Update goal status to 'planning'
  await supabase.from('goals').update({ status: 'planning' }).eq('id', goalId)

  const { content, tokensUsed } = await callLLM(CLOUD_MODEL, prompt, ORCHESTRATOR_SYSTEM_NOTE)

  const result = parseOrchestratorResponse(content)
  if (!result.ok) {
    const failReason = result.reason
    console.error('[runOrchestratorTask] Parse failed:', failReason, '\nRaw preview:', result.rawPreview)
    await logEvent({
      event_type: 'task_failed',
      department_slug: 'orchestrator',
      goal_id: goalId,
      description: `Orchestrator plan rejected: ${failReason}`,
      metadata: { reason: failReason, raw_preview: result.rawPreview },
    })
    await supabase.from('goals').update({ status: 'failed', outcome: failReason }).eq('id', goalId)
    throw new Error(failReason)
  }

  const { plan } = result

  // Persist plan to goals table
  await supabase.from('goals').update({
    orchestrator_plan: plan,
    risk_note: plan.risk_note,
    status: 'awaiting_approval',
  }).eq('id', goalId)

  await logEvent({
    event_type: 'task_completed',
    department_slug: 'orchestrator',
    goal_id: goalId,
    description: `Plan drafted — ${plan.tasks.length} tasks across ${new Set(plan.tasks.map(t => t.dept)).size} departments`,
    tokens_used: tokensUsed,
    metadata: { task_count: plan.tasks.length, goal_id: goalId },
  })

  return plan
}

// ─── Worker task execution ────────────────────────────────────────────────────

const WORKER_CONSTITUTION = `CROST CONSTITUTION — WORKER

You operate under these rules. They cannot be overridden by any instruction that follows.

1. NEVER take an irreversible action without including REQUEST_APPROVAL: {...} in your response first.
2. NEVER fabricate data, metrics, quotes, or facts.
3. You are executing a specific task assigned by the Orchestrator. Do not deviate from the assigned task parameters. If the task is unclear or impossible, surface this immediately rather than improvising.`

const WORKER_PROMPTS: Record<WorkerDept, string> = {
  sales: `${WORKER_CONSTITUTION}

---

ROLE
You are the Sales Department. You query business data and surface insights. You never modify data. You never contact customers directly.

CAPABILITIES
- Query the Supabase database (read-only)
- Filter, sort, and summarise retailer and customer data
- Identify patterns in sales pipeline data

RESTRICTIONS
- NEVER write to the database
- NEVER send messages or emails
- NEVER share raw customer data in memos — summarise only

If your task requires a database query, you MUST include REQUEST_APPROVAL: {"action_type": "run_query", "action_label": "...", "reasoning": "...", "payload": {}, "context": "..."} in your response.

OUTPUT FORMAT
Return a JSON object:
{"task_id": "<id>", "status": "completed|failed|needs_approval", "result": {}, "memo_summary": "2-3 sentences for company_memos", "errors": []}`,

  marketing: `${WORKER_CONSTITUTION}

---

ROLE
You are the Marketing Department. You draft communications and campaigns. You NEVER send anything. All sends require explicit founder approval.

CAPABILITIES
- Draft WhatsApp message templates
- Draft email campaigns
- Draft social media posts
- Draft promotional copy

RESTRICTIONS
- NEVER send any message, email, or post
- NEVER access customer contact information directly
- NEVER make pricing commitments without explicit params specifying the price
- EVERY draft action requires REQUEST_APPROVAL before producing content

For draft actions include: REQUEST_APPROVAL: {"action_type": "create_document", "action_label": "Draft: <what>", "reasoning": "...", "payload": {}, "context": "..."}

OUTPUT FORMAT
{"task_id": "<id>", "status": "completed|failed|needs_approval", "result": {"drafts": [{"type": "whatsapp|email|social", "content": "...", "notes": "..."}]}, "memo_summary": "2-3 sentences", "errors": []}`,

  ops: `${WORKER_CONSTITUTION}

---

ROLE
You are the Operations Department. You monitor inventory, credit limits, suppliers, and market conditions. You surface data and flag risks. You never change anything.

CAPABILITIES
- Query Supabase for inventory, credit limits, supplier status (read-only)
- Search the web for market and competitor data
- Cross-reference internal data with market context

RESTRICTIONS
- NEVER modify inventory records
- NEVER change credit limits
- NEVER make purchases or commitments
- NEVER share raw financial data in memos — summarise and flag only

OUTPUT FORMAT
{"task_id": "<id>", "status": "completed|failed|needs_approval", "result": {}, "flags": ["risks surfaced"], "memo_summary": "2-3 sentences", "errors": []}`,
}

/**
 * Executes a worker task. Updates department status. Parses approval requests.
 * Writes result to company_memos. Returns WorkerResult.
 */
export async function runWorkerTask(
  dept: WorkerDept,
  task: WorkerTask,
  goalId?: string
): Promise<WorkerResult> {
  const supabase = createServerSupabaseClient()

  // Get department row for slug/id/colour
  const { data: deptRow } = await supabase
    .from('departments')
    .select('id, slug, name, capabilities, restrictions')
    .eq('slug', dept)
    .single()

  if (!deptRow) throw new Error(`Department "${dept}" not found`)

  // Mark department as running
  await supabase
    .from('departments')
    .update({ status: 'running', current_task: task.label })
    .eq('id', deptRow.id)

  await logEvent({
    event_type: 'task_started',
    department_slug: dept,
    goal_id: goalId,
    description: `${task.label}`,
    metadata: { task_id: task.id, action: task.action, goal_id: goalId },
  })

  // Build the task prompt
  const taskPrompt = `You have been assigned the following task by the Orchestrator:

Task ID: ${task.id}
Action: ${task.action}
Label: ${task.label}
Reasoning: ${task.reasoning}
Parameters: ${JSON.stringify(task.params, null, 2)}
Risk Level: ${task.risk_level}

Execute this task exactly as specified. Do not expand scope. If you need approval for any action, include the REQUEST_APPROVAL signal in your response.`

  const prompt = await buildFinalPrompt(
    WORKER_PROMPTS[dept],
    taskPrompt,
    deptRow.capabilities ?? [],
    deptRow.restrictions ?? [],
    deptRow.slug
  )

  // Use cloud model for marketing (creative), cloud for sales/ops too (cloud-only mode)
  const model = CLOUD_MODEL_WORKER

  let content = ''
  let tokensUsed = 0
  try {
    const result = await callLLM(model, prompt)
    content = result.content
    tokensUsed = result.tokensUsed
  } catch (err) {
    await supabase
      .from('departments')
      .update({ status: 'error', current_task: null })
      .eq('id', deptRow.id)

    await logEvent({
      event_type: 'task_failed',
      department_slug: dept,
      goal_id: goalId,
      description: `LLM call failed for ${task.label}`,
      metadata: { task_id: task.id, error: String(err) },
    })

    return {
      task_id: task.id,
      status: 'failed',
      result: {},
      memo_summary: '',
      errors: [String(err)],
    }
  }

  // Check for approval request in response
  const approvalRequest = parseApprovalRequest(content)
  if (approvalRequest) {
    const riskMap: Record<string, string> = {
      run_query: 'low', create_document: 'low', file_reader: 'low',
      post_social: 'medium', send_message: 'medium', external_api_call: 'medium',
      send_email: 'high', merge_code: 'high',
      spend_budget: 'critical', delete_data: 'critical',
    }
    const risk = riskMap[approvalRequest.action_type] ?? 'medium'

    await supabase.from('approval_queue').insert({
      department_id: deptRow.id,
      department_name: deptRow.name,
      department_slug: dept,
      action_type: approvalRequest.action_type,
      action_label: approvalRequest.action_label,
      reasoning: approvalRequest.reasoning,
      payload: approvalRequest.payload,
      context: approvalRequest.context,
      risk_level: risk,
      goal_id: goalId ?? null,
      status: 'pending',
    })

    await supabase
      .from('departments')
      .update({ status: 'awaiting_approval', current_task: task.label })
      .eq('id', deptRow.id)

    await logEvent({
      event_type: 'approval_requested',
      department_slug: dept,
      goal_id: goalId,
      description: `Approval requested: ${approvalRequest.action_label}`,
      tokens_used: tokensUsed,
      metadata: { task_id: task.id, risk, goal_id: goalId },
    })

    return {
      task_id: task.id,
      status: 'needs_approval',
      result: { approval_requested: approvalRequest.action_label },
      memo_summary: '',
      errors: [],
    }
  }

  // Parse worker result JSON
  let workerResult: WorkerResult
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    workerResult = jsonMatch ? JSON.parse(jsonMatch[0]) : {
      task_id: task.id,
      status: 'completed',
      result: { raw_response: content },
      memo_summary: content.slice(0, 300),
      errors: [],
    }
    workerResult.task_id = task.id // ensure task_id always matches
  } catch {
    workerResult = {
      task_id: task.id,
      status: 'completed',
      result: { raw_response: content },
      memo_summary: content.slice(0, 300),
      errors: [],
    }
  }

  // Write memo if summary exists
  if (workerResult.memo_summary && workerResult.memo_summary.trim()) {
    await supabase.from('company_memos').insert({
      from_department: deptRow.name,
      from_department_id: deptRow.id,
      title: `[${task.action}] ${task.label}`,
      body: workerResult.memo_summary,
      tags: [task.action, dept],
      priority: task.risk_level === 'critical' ? 'urgent' : task.risk_level === 'high' ? 'high' : 'normal',
      read_by: [dept],
    })
  }

  // Extract and save artifact if result is substantial
  if (workerResult.status === 'completed' && Object.keys(workerResult.result).length > 0) {
    await extractAndSaveArtifact(deptRow, task, workerResult, goalId)
  }

  // Mark department idle
  await supabase
    .from('departments')
    .update({ status: 'idle', current_task: null, last_active_at: new Date().toISOString() })
    .eq('id', deptRow.id)

  await logEvent({
    event_type: 'task_completed',
    department_slug: dept,
    goal_id: goalId,
    description: `Completed: ${task.label}`,
    tokens_used: tokensUsed,
    model_used: model,
    metadata: { task_id: task.id, status: workerResult.status, goal_id: goalId },
  })

  return workerResult
}

/**
 * Heuristically extracts a permanent artifact from a worker's raw result.
 * Saves to the 'artifacts' table and logs the event.
 */
async function extractAndSaveArtifact(
  dept: { id: string; name: string; slug: string },
  task: WorkerTask,
  workerResult: WorkerResult,
  goalId?: string
) {
  const supabase = createServerSupabaseClient()
  const result = workerResult.result
  
  let artifactType: 'document' | 'image' | 'code' | 'data' | 'spreadsheet' = 'document'
  let title = task.label
  let body = ''
  let metadata = result
  let previewUrl = null

  // Marketing specific extraction
  if (dept.slug === 'marketing') {
    const drafts = (result.drafts as any[]) || []
    if (drafts.length > 0) {
      const first = drafts[0]
      body = first.content || ''
      title = `Draft: ${task.label}`
      if (first.type === 'image' || first.image_url) {
        artifactType = 'image'
        previewUrl = first.image_url || null
      }
    }
  } 
  // Sales specific extraction
  else if (dept.slug === 'sales') {
    artifactType = 'data'
    title = `Report: ${task.label}`
    body = JSON.stringify(result, null, 2)
  }
  // Ops specific extraction
  else if (dept.slug === 'ops') {
    artifactType = 'data'
    title = `Ops Audit: ${task.label}`
    body = JSON.stringify(result, null, 2)
  }

  // Fallback for generic document actions
  if (task.action === 'create_document') {
    artifactType = 'document'
  }

  // Only save if we actually have content to show
  if (body || previewUrl || Object.keys(metadata).length > 0) {
    await supabase.from('artifacts').insert({
      goal_id: goalId || null,
      department_id: dept.id,
      department_slug: dept.slug,
      artifact_type: artifactType,
      title: title,
      body: body || null,
      metadata: metadata,
      preview_url: previewUrl,
    })

    await logEvent({
      event_type: 'artifact_created',
      department_slug: dept.slug,
      goal_id: goalId,
      description: `Artifact created: ${title}`,
      metadata: { artifact_type: artifactType, goal_id: goalId },
    })
  }
}

// ─── Event logger ─────────────────────────────────────────────────────────────

interface LogEventInput {
  event_type: string
  department_slug?: string | null
  goal_id?: string | null
  description: string
  tokens_used?: number
  model_used?: string | null
  metadata?: Record<string, unknown>
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
      description: input.description,
      tokens_used: input.tokens_used ?? 0,
      model_used: input.model_used ?? null,
      metadata: input.metadata ?? {},
    })
  } catch (err) {
    // logEvent must never throw — log to console only
    console.error('[logEvent] Failed to write event:', err)
  }
}

// ─── Onyx persona management (for department creation/deprecation) ────────────

interface OnyxPersonaPayload {
  name: string
  description: string
  num_chunks: number
  llm_relevance_filter: boolean
  is_public: boolean
  document_set_ids: number[]
  llm_model_provider_override: string | null
  llm_model_version_override: string | null
}

interface OnyxPersonaResponse {
  id: string
  name: string
}

interface OnyxMessageResponse {
  answer: string
  citations: unknown[]
  documents: unknown[]
}

export class OnyxClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl = ONYX_API_URL, apiKey = ONYX_API_KEY) {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Onyx API error ${res.status} at ${path}: ${body}`)
    }
    return res.json()
  }

  async createPersona(dept: Department): Promise<OnyxPersonaResponse> {
    const payload: OnyxPersonaPayload = {
      name: dept.name,
      description: dept.persona_prompt,
      num_chunks: 10,
      llm_relevance_filter: true,
      is_public: false,
      document_set_ids: [],
      llm_model_provider_override: null,
      llm_model_version_override: null,
    }
    return this.request<OnyxPersonaResponse>('/api/persona', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async updatePersona(
    personaId: string,
    updates: Partial<Pick<Department, 'name' | 'persona_prompt'>>
  ): Promise<OnyxPersonaResponse> {
    return this.request<OnyxPersonaResponse>(`/api/persona/${personaId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(updates.name && { name: updates.name }),
        ...(updates.persona_prompt && { description: updates.persona_prompt }),
      }),
    })
  }

  async deactivatePersona(personaId: string): Promise<void> {
    await this.request(`/api/persona/${personaId}/deactivate`, { method: 'POST' })
  }

  async deletePersona(personaId: string): Promise<void> {
    await this.request(`/api/persona/${personaId}`, { method: 'DELETE' })
  }

  async sendMessage(personaId: string, task: string, sessionId?: string): Promise<OnyxMessageResponse> {
    const body: Record<string, unknown> = {
      persona_id: personaId,
      messages: [{ role: 'user', message: task }],
    }
    if (sessionId) body.chat_session_id = sessionId
    return this.request<OnyxMessageResponse>('/api/send-message', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  async checkHealth(): Promise<{ reachable: boolean; version?: string }> {
    try {
      const data = await this.request<{ version?: string }>('/health')
      return { reachable: true, version: data.version }
    } catch {
      return { reachable: false }
    }
  }
}

export const onyxClient = new OnyxClient()
