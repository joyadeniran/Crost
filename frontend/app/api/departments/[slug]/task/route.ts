// POST /api/departments/[slug]/task
// Dispatches a task to a department's persona.
//
// Flow:
//   1. Validate department is active
//   2. Set status = 'running', log task_started
//   3. Build final prompt (persona + task)
//   4. Send to LLM
//   5. Scan response for structured approval requests
//   6. Separate outputs: large/structured → artifacts (files), small/narrative → memos
//   7. Set status = 'idle', log task_completed
//   8. Return { answer, approval?, artifact_id? }
//
// Per CROST_SPEC Section 5-6:
// - Memos: human-readable structured company state in database
// - Artifacts: downloadable files (json, csv, xlsx, docx) in Supabase Storage
// - Rule: Long outputs (>1200 chars) → Artifact, Small outputs → Memo

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { buildFinalPrompt, callLLM } from '@/lib/llm-client'
import { z } from 'zod'
import type { ActionType, RiskLevel } from '@/types'
import { detectOutputType } from '@/lib/artifact-transformers'

export const dynamic = 'force-dynamic'

interface Params { params: { slug: string } }

const TaskSchema = z.object({
  task: z.string().min(1, 'Task cannot be empty').max(4000, 'Task is too long'),
  session_id: z.string().optional(),
})

interface ApprovalRequest {
  request_approval: true
  action_type: ActionType
  action_label: string
  payload: Record<string, unknown>
  context?: string
  risk_level?: RiskLevel
}

function extractApprovalRequest(text: string): ApprovalRequest | null {
  // Format 1: REQUEST_APPROVAL: { ... }  (used by the HITL protocol in buildFinalPrompt)
  const raMatch = text.match(/REQUEST_APPROVAL\s*:\s*(\{[\s\S]*?\})\s*$/)
  if (raMatch) {
    try {
      const parsed = JSON.parse(raMatch[1])
      if (!parsed.action_type || !parsed.action_label) return null
      return {
        request_approval: true,
        action_type: parsed.action_type,
        action_label: parsed.action_label,
        payload: parsed.payload ?? {},
        context: parsed.context ?? parsed.reasoning ?? '',
        risk_level: parsed.risk_level,
      } as ApprovalRequest
    } catch { /* fall through to format 2 */ }
  }

  // Format 2: ```json { "request_approval": true, ... }``` (legacy JSON block)
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?"request_approval"[\s\S]*?\})\s*```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (parsed.request_approval !== true) return null
      if (!parsed.action_type || !parsed.action_label || !parsed.payload) return null
      return parsed as ApprovalRequest
    } catch { return null }
  }

  return null
}

// Helper: Detect if content is structured data (JSON-like) vs narrative text
function isStructuredContent(content: string): boolean {
  const trimmed = content.trim()
  // Strip markdown code fences if present
  const stripped = trimmed.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  return (
    (stripped.startsWith('{') && stripped.endsWith('}')) || // JSON object
    (stripped.startsWith('[') && stripped.endsWith(']'))    // JSON array
  )
}

// Helper: Create artifact from content and store file in Supabase Storage
async function createArtifactFromContent(
  content: string,
  deptId: string,
  deptSlug: string,
  taskPreview: string,
  userId: string,
  supabase: any
): Promise<{ id: string; file_url: string } | null> {
  try {
    // Detect content type
    let isJson = false;
    try { JSON.parse(content); isJson = true; } catch { }
    if (!isJson) {
       isJson = content.trim().startsWith('{') || content.trim().startsWith('[');
    }
    
    const detection = detectOutputType(content, isJson);
    
    let fileContent: string | Buffer = content;
    if (detection.targetFormat !== 'json' && detection.transformer) {
      try {
        const parsedContent = isJson ? JSON.parse(content) : content;
        fileContent = await detection.transformer(parsedContent) as string | Buffer;
      } catch (err) {
        console.error('[Format Transformation Error]', err);
        fileContent = content;
        detection.targetFormat = isJson ? 'json' : 'txt';
      }
    }

    let fileType = 'text/plain';
    let extension = `.${detection.targetFormat}`;
    let artifactType: 'document' | 'data' | 'spreadsheet' = 'document';

    if (detection.targetFormat === 'json') {
      fileType = 'application/json';
      artifactType = 'data';
    } else if (detection.targetFormat === 'xlsx' || detection.targetFormat === 'csv') {
      fileType = detection.targetFormat === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
      artifactType = 'spreadsheet';
    } else if (detection.targetFormat === 'docx') {
      fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      artifactType = 'document';
    } else if (detection.targetFormat === 'md') {
      fileType = 'text/markdown';
      artifactType = 'document';
    }

    // Generate filename
    const timestamp = Date.now()
    const fileName = `dept-${deptSlug}-${timestamp}${extension}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from('artifacts')
      .upload(`departments/${deptId}/${fileName}`, fileContent, {
        contentType: fileType,
        upsert: false,
      })

    if (uploadErr || !uploadData) {
      console.error('[Artifact Upload Error]', uploadErr)
      return null
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('artifacts')
      .getPublicUrl(uploadData.path)

    const fileUrl = urlData.publicUrl

    // Store metadata in artifacts table
    const { data: artifact, error: artifactErr } = await supabase
      .from('artifacts')
      .insert({
        department_id: deptId,
        department_slug: deptSlug,
        artifact_type: artifactType,
        title: `Department Output: ${taskPreview.slice(0, 60)}`,
        file_url: fileUrl,
        metadata: {
          source: 'department_task',
          contentType: fileType,
          sizeBytes: content.length,
          isStructured: isJson || detection.targetFormat === 'csv' || detection.targetFormat === 'xlsx' || detection.targetFormat === 'json',
        },
        created_by: userId,
      })
      .select('id')
      .single()

    if (artifactErr || !artifact) {
      console.error('[Artifact Metadata Error]', artifactErr)
      return null
    }

    return { id: artifact.id, file_url: fileUrl }
  } catch (err) {
    console.error('[Create Artifact Error]', err)
    return null
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

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
    .eq('created_by', user.id)
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
    created_by: user.id
  })

  let answer = ''
  let tokensUsed = 0
  let modelUsed = dept.model_name
  let artifactId: string | undefined

  try {
    // Build prompt
    const finalPrompt = await buildFinalPrompt(dept.persona_prompt, body.task, dept.capabilities, dept.restrictions, dept.slug)

    // Call LLM
    const { content, tokensUsed: used } = await callLLM(dept.model_name, finalPrompt, undefined, user.id)
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
          created_by: user.id,
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
        created_by: user.id,
      })

      return NextResponse.json({
        answer,
        approval_requested: true,
        approval_id: approval?.id,
      })
    }

    // No approval needed — task complete
    // SEPARATION LOGIC:
    //   - Structured JSON (any size) → Artifact file (docx / xlsx / md based on content)
    //   - Narrative text              → Memo
    const isStructured = isStructuredContent(answer)

    if (isStructured) {
      // Any structured output → Create artifact file
      const artifact = await createArtifactFromContent(
        answer,
        dept.id,
        dept.slug,
        body.task.slice(0, 60),
        user.id,
        supabase
      )

      if (artifact) {
        artifactId = artifact.id

        // Also store a brief memo referencing the artifact
        await supabase.from('company_memos').insert({
          from_department: dept.name,
          from_department_id: dept.id,
          title: `[Task] ${body.task.slice(0, 80)}`,
          body: `Output stored as downloadable artifact (ID: ${artifact.id}). See artifacts section to download.`,
          tags: ['department_task', dept.slug, 'artifact_reference'],
          source_type: 'agent',
          confidence: 0.9,
          created_by: user.id,
        })
      } else {
        // Fallback if artifact creation fails: store full answer as memo
        await supabase.from('company_memos').insert({
          from_department: dept.name,
          from_department_id: dept.id,
          title: `[Task] ${body.task.slice(0, 80)}`,
          body: answer.slice(0, 3000),
          tags: ['department_task', dept.slug],
          source_type: 'agent',
          confidence: 0.7,
          created_by: user.id,
        })
      }
    } else {
      // Narrative / plain-text output → Store as memo only
      await supabase.from('company_memos').insert({
        from_department: dept.name,
        from_department_id: dept.id,
        title: `[Task] ${body.task.slice(0, 80)}`,
        body: answer,
        tags: ['department_task', dept.slug],
        source_type: 'agent',
        confidence: 0.8,
        created_by: user.id,
      })
    }

    // Update department status to idle
    await supabase
      .from('departments')
      .update({ status: 'idle', current_task: null })
      .eq('id', dept.id)

    // Log completion
    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'task_completed',
      description: `Task completed: "${body.task.slice(0, 60)}${body.task.length > 60 ? '…' : ''}"`,
      metadata: { artifact_created: !!artifactId },
      tokens_used: Math.round(tokensUsed),
      model_used: modelUsed,
      created_by: user.id,
    })

    return NextResponse.json({
      answer,
      approval_requested: false,
      artifact_id: artifactId
    })
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
      created_by: user.id,
    })

    console.error('[POST /api/departments/:slug/task]', err)
    return NextResponse.json({ error: 'Task execution failed. Check event log for details.' }, { status: 500 })
  }
}
