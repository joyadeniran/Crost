// POST /api/departments/[slug]/task
// Dispatches a task to a department's Onyx persona.
//
// Flow:
//   1. Validate department is active + Onyx synced
//   2. Set status = 'running', log task_started
//   3. Build final prompt (constitution + persona + local_identity + task)
//   4. Send to Onyx via onyxClient.sendMessage()
//   5. Scan response for structured approval requests
//   6. Set status = 'idle' (or 'awaiting_approval'), log task_completed
//   7. Return { answer, approval? }
//
// Approval detection: if the agent response contains a JSON block with
// "request_approval": true, we parse it and create an approval_queue entry.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { onyxClient, buildFinalPrompt } from '@/lib/onyx-client'
import { z } from 'zod'
import type { ActionType, ModelProvider, RiskLevel } from '@/types'

// ── LLM dispatch ──────────────────────────────────────────────────────────────
// Tries LiteLLM proxy first (localhost:4000). If that fails or is unreachable,
// falls back to calling the cloud provider APIs directly.
async function callLLM(modelName: string, provider: ModelProvider, prompt: string): Promise<string> {
  interface OpenAIResp { choices: { message: { content: string } }[] }

  // 1. Try LiteLLM proxy
  const litellmBase = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000'
  try {
    const res = await fetch(`${litellmBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelName, messages: [{ role: 'user', content: prompt }], temperature: 0.7 }),
      signal: AbortSignal.timeout(3000), // fast fail if proxy unreachable
    })
    if (res.ok) {
      const j = await res.json() as OpenAIResp
      const text = j.choices?.[0]?.message?.content
      if (text) return text
    }
  } catch {
    // LiteLLM unavailable — continue to direct API fallback
  }

  // 2. Direct Ollama (local mode)
  if (provider === 'local') {
    const ollamaBase = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
    const ollamaModel = modelName.replace('local/', '').replace('gemma3', 'gemma3:4b')
    const res = await fetch(`${ollamaBase}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModel, prompt, stream: false }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`)
    const j = await res.json() as { response: string }
    return j.response
  }

  // 3. Direct Groq (OpenAI-compatible)
  const groqKey = process.env.GROQ_API_KEY
  if (groqKey && (provider === 'groq' || modelName.includes('groq') || modelName.includes('llama'))) {
    const groqModel = modelName.replace('cloud/', '').replace('groq/', '')
    const resolvedModel = groqModel.startsWith('llama') ? groqModel : 'llama-3.3-70b-versatile'
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` },
      body: JSON.stringify({ model: resolvedModel, messages: [{ role: 'user', content: prompt }], temperature: 0.7 }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`)
    const j = await res.json() as OpenAIResp
    return j.choices?.[0]?.message?.content ?? ''
  }

  // 4. Direct Gemini
  const geminiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (geminiKey && (provider === 'gemini' || modelName.includes('gemini'))) {
    const geminiModel = modelName.includes('flash') ? 'gemini-2.0-flash' : 'gemini-1.5-pro'
    interface GeminiResp { candidates: { content: { parts: { text: string }[] } }[] }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(30_000),
      }
    )
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`)
    const j = await res.json() as GeminiResp
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }

  // 5. Direct Claude / Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey && (provider === 'claude' || modelName.includes('claude'))) {
    interface AnthropicResp { content: { text: string }[] }
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`)
    const j = await res.json() as AnthropicResp
    return j.content?.[0]?.text ?? ''
  }

  throw new Error(
    'No LLM available. LiteLLM is unreachable and no API key is configured. ' +
    'Add GROQ_API_KEY or GOOGLE_AI_STUDIO_API_KEY to .env.local'
  )
}
// ── end LLM dispatch ──────────────────────────────────────────────────────────

interface Params { params: { slug: string } }

const TaskSchema = z.object({
  task: z.string().min(1, 'Task cannot be empty').max(4000, 'Task is too long'),
  session_id: z.string().optional(),
})

// Extracts a JSON approval request block from the agent response, if present.
// The agent is expected to output something like:
// ```json
// { "request_approval": true, "action_type": "send_email", ... }
// ```
interface ApprovalRequest {
  request_approval: true
  action_type: ActionType
  action_label: string
  payload: Record<string, unknown>
  context?: string
  risk_level?: RiskLevel
}

function extractApprovalRequest(text: string): ApprovalRequest | null {
  const match = text.match(/```(?:json)?\s*(\{[\s\S]*?"request_approval"[\s\S]*?\})\s*```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (parsed.request_approval !== true) return null
    if (!parsed.action_type || !parsed.action_label || !parsed.payload) return null
    return parsed as ApprovalRequest
  } catch {
    return null
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const supabase = createServerSupabaseClient()

  let body: z.infer<typeof TaskSchema>
  try {
    body = TaskSchema.parse(await req.json())
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message, code: 'VALIDATION_ERROR' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Fetch department
  const { data: dept, error: deptErr } = await supabase
    .from('departments')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (deptErr || !dept) {
    return NextResponse.json({ error: 'Department not found' }, { status: 404 })
  }
  if (dept.activation_stage !== 'active') {
    return NextResponse.json(
      { error: `Department is "${dept.activation_stage}" — must be active to run tasks.`, code: 'NOT_ACTIVE' },
      { status: 422 }
    )
  }
  // null / SYNC_FAILED = never synced → block and tell user to resync
  if (!dept.onyx_persona_id) {
    return NextResponse.json(
      { error: 'Department not yet synced. Go to the dashboard and click "Sync Departments".', code: 'ONYX_NOT_SYNCED' },
      { status: 422 }
    )
  }
  if (dept.onyx_persona_id === 'SYNC_FAILED') {
    return NextResponse.json(
      { error: 'Onyx persona sync failed. Go to Settings → click "Sync Departments" to retry.', code: 'ONYX_NOT_SYNCED' },
      { status: 422 }
    )
  }
  // DIRECT_LLM = Onyx unavailable, route straight to LiteLLM — this is fully supported
  if (dept.status === 'running') {
    return NextResponse.json(
      { error: 'Department is already running a task.', code: 'ALREADY_RUNNING' },
      { status: 409 }
    )
  }

  // ── Token limit enforcement ─────────────────────────────────────────────────
  // Fetch hard limit from system_config
  const { data: limitCfg } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'token_hard_limit_per_session')
    .single()
  const hardLimit = parseInt(String(limitCfg?.value ?? '').replace(/"/g, '') || '50000', 10)

  // Sum tokens used today by this department
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { data: tokenRows } = await supabase
    .from('event_log')
    .select('tokens_used')
    .eq('department_id', dept.id)
    .gte('created_at', todayStart.toISOString())

  const tokensUsedToday = tokenRows?.reduce((sum, r) => sum + (r.tokens_used ?? 0), 0) ?? 0
  const usagePct = hardLimit > 0 ? tokensUsedToday / hardLimit : 0

  // At or above 100% → check if we can auto-switch to local, else block
  if (usagePct >= 1) {
    const currentMode = dept.model_provider
    if (currentMode !== 'local') {
      // Auto-switch to local
      await supabase
        .from('departments')
        .update({ model_provider: 'local', model_name: 'gemma3:4b' })
        .eq('id', dept.id)

      await supabase.from('event_log').insert({
        department_id: dept.id,
        department_slug: dept.slug,
        event_type: 'mode_switched',
        description: `Token limit hit (${tokensUsedToday.toLocaleString()}/${hardLimit.toLocaleString()} tokens today) — auto-switched to local AI`,
        metadata: { from: currentMode, to: 'local', usage_pct: Math.round(usagePct * 100) },
      })
    } else {
      // Already local and still at limit — pause
      await supabase.from('event_log').insert({
        department_id: dept.id,
        department_slug: dept.slug,
        event_type: 'token_limit_hit',
        description: `Token limit hit on local AI too — task paused. Resets at midnight.`,
        metadata: { tokens_today: tokensUsedToday, hard_limit: hardLimit },
      })
      return NextResponse.json({
        error: `Daily token limit reached (${tokensUsedToday.toLocaleString()} / ${hardLimit.toLocaleString()} tokens). Resets at midnight.`,
        code: 'TOKEN_LIMIT_EXCEEDED',
      }, { status: 429 })
    }
  }
  // ── end token limit check ────────────────────────────────────────────────────

  // Mark as running
  await supabase
    .from('departments')
    .update({ status: 'running', current_task: body.task.slice(0, 120), last_active_at: new Date().toISOString() })
    .eq('id', dept.id)

  await supabase.from('event_log').insert({
    department_id: dept.id,
    department_slug: dept.slug,
    event_type: 'task_started',
    description: `Task started: "${body.task.slice(0, 80)}${body.task.length > 80 ? '…' : ''}"`,
    metadata: { task_preview: body.task.slice(0, 200) },
  })

  let answer = ''
  let tokensUsed = 0
  let modelUsed = dept.model_name

  try {
    // Build constitution-first prompt
    const finalPrompt = await buildFinalPrompt(dept.persona_prompt, body.task)

    const isDirectLLM = dept.onyx_persona_id?.startsWith('direct_llm:') ?? false

    if (isDirectLLM) {
      // ── Direct API path — tries LiteLLM first, falls back to cloud APIs ────
      answer = await callLLM(dept.model_name, dept.model_provider, finalPrompt)
      tokensUsed = Math.round((finalPrompt.length + answer.length) / 4)
      modelUsed = dept.model_name
    } else {
      // ── Onyx path ──────────────────────────────────────────────────────────
      const response = await onyxClient.sendMessage(
        dept.onyx_persona_id!,
        finalPrompt,
        body.session_id
      )
      answer = response.answer
      tokensUsed = Math.round((finalPrompt.length + answer.length) / 4)
    }

    // Detect approval request in response
    const approvalReq = extractApprovalRequest(answer)

    if (approvalReq) {
      // Create approval_queue entry
      const { data: approval } = await supabase
        .from('approval_queue')
        .insert({
          department_id: dept.id,
          department_name: dept.name,
          department_slug: dept.slug,
          action_type: approvalReq.action_type,
          action_label: approvalReq.action_label,
          payload: approvalReq.payload,
          context: approvalReq.context ?? body.task.slice(0, 300),
          risk_level: approvalReq.risk_level ?? 'medium',
        })
        .select()
        .single()

      // Set department status to awaiting_approval
      await supabase
        .from('departments')
        .update({ status: 'awaiting_approval', current_task: null })
        .eq('id', dept.id)

      await supabase.from('event_log').insert({
        department_id: dept.id,
        department_slug: dept.slug,
        event_type: 'approval_requested',
        description: `Approval requested: ${approvalReq.action_label}`,
        metadata: { approval_id: approval?.id, action_type: approvalReq.action_type },
        tokens_used: Math.round(tokensUsed),
        model_used: modelUsed,
      })

      return NextResponse.json({
        answer,
        approval_requested: true,
        approval_id: approval?.id,
      })
    }

    // No approval needed — task complete
    await supabase
      .from('departments')
      .update({ status: 'idle', current_task: null })
      .eq('id', dept.id)

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'task_completed',
      description: `Task completed: "${body.task.slice(0, 60)}${body.task.length > 60 ? '…' : ''}"`,
      metadata: {},
      tokens_used: Math.round(tokensUsed),
      model_used: modelUsed,
    })

    return NextResponse.json({ answer, approval_requested: false })
  } catch (err) {
    // Reset department status on failure
    await supabase
      .from('departments')
      .update({ status: 'error', current_task: null })
      .eq('id', dept.id)

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'task_failed',
      description: `Task failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      metadata: { error: String(err) },
    })

    console.error('[POST /api/departments/:slug/task]', err)
    return NextResponse.json({ error: 'Task execution failed. Check event log for details.' }, { status: 500 })
  }
}
