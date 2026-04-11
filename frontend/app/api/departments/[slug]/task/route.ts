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
import { buildFinalPrompt, callLLM } from '@/lib/llm-client'
import { z } from 'zod'
import type { ActionType, RiskLevel } from '@/types'

export const dynamic = 'force-dynamic'

interface Params { params: { slug: string } }

const TaskSchema = z.object({
  task: z.string().min(1, 'Task cannot be empty').max(4000, 'Task is too long'),
  session_id: z.string().optional(),
})

// Extracts a JSON approval request block from the agent response, if present.
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

  if (dept.status === 'running') {
    return NextResponse.json(
      { error: 'Department is already running a task.', code: 'ALREADY_RUNNING' },
      { status: 409 }
    )
  }

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
    created_by: dept.created_by
  })

  let answer = ''
  let tokensUsed = 0
  let modelUsed = dept.model_name

  try {
    // Build constitution-first prompt
    const finalPrompt = await buildFinalPrompt(dept.persona_prompt, body.task, dept.capabilities, dept.restrictions, dept.slug)

    // Cloud-only path
    const { content, tokensUsed: used } = await callLLM(dept.model_name, finalPrompt, undefined, dept.created_by)
    answer = content
    tokensUsed = used

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
