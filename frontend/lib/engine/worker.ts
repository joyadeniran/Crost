// lib/engine/worker.ts
// Department worker task execution (runWorkerTask) + its artifact-upload
// helper. Extracted verbatim from lib/llm-client.ts during the Phase 2
// god-module split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'
import { detectOutputType } from '@/lib/artifact-transformers'
import type { WorkerTask, WorkerResult, WorkerDept } from '@/types'
import { normalizeToolName, formatMemoBody } from '@/lib/utils'
import { loadSkillsForTask } from '@/lib/skills'
import { generateAndInsertSuggestedActions } from '@/lib/suggested-actions'
import { addTaskLog } from '@/lib/company-memo'
import { resolveDepartmentBySlug } from './departments'
import { buildFinalPrompt } from './prompt'
import { getModel, callLLM } from './model'
import { parseApprovalRequest } from './parse'
import { logEvent } from './events'
import { runOrcReport } from './orchestrator'
import { log } from '@/lib/log'

/**
 * Build the task section of the worker prompt. Exported for unit tests.
 *
 * Written for weak/cheap execution models (Groq Llama, Gemini Lite): the
 * output contract is explicit — an exact JSON schema with the three legal
 * response shapes — because the parser in runWorkerTask infers task status
 * from `needs_more_data` / `status` fields the model was previously never
 * told about.
 */
export function buildWorkerTaskPrompt(task: WorkerTask): string {
  return `Execute the task below. Respond with EXACTLY ONE JSON object — no prose before or after it, no markdown fences.

TASK:
ID: ${task.id}
Action: ${task.action}
Label: ${task.label}
Reasoning: ${task.reasoning}
Expected Deliverable: ${task.expected_deliverable}
Params: ${JSON.stringify(task.params)}

OUTPUT FORMAT — your response must be one of these three JSON shapes:

1. Task done (the normal case):
{
  "status": "completed",
  "summary": "<2-3 sentences: what you produced and the key takeaway>",
  ...the full deliverable content as additional fields in this same object.
  If a SKILLS GUIDANCE section is present above, follow its structure for the
  deliverable exactly. Otherwise use sensible fields, e.g. for a document:
  "title": "...", "sections": [{ "heading": "...", "content": "..." }]
}

2. Task attempted but cannot succeed:
{ "status": "failed", "summary": "<one sentence: what failed and why>" }

3. Required data is genuinely missing — BEFORE using this shape you MUST check,
in order: the PRIOR TASK OUTPUTS section, the COMPANY MEMOS section, and the
KNOWLEDGE_BASE_SEARCH tool. Only if the data is absent from all three:
{
  "needs_more_data": true,
  "missing_data": ["<specific, founder-actionable item, e.g. 'Q1 revenue figures'>"],
  "summary": "<what you need and what you will do once you have it>"
}

Hard rules:
- Never invent facts, numbers, or names. Use the recovery protocol's template
  fallback (placeholders) when drafting documents with missing data.
- Never return an empty object or plain prose.
- External actions (email, post, payment) → output the REQUEST_APPROVAL block
  from your protocol INSTEAD of this JSON, and nothing else.`
}

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
        log.error('[uploadArtifact] Transform error, falling back to raw', { module: 'engine/worker', goalId, taskId, error: String(err) })
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
      log.error('[uploadArtifact] Storage upload failed', { module: 'engine/worker', goalId, taskId, error: String(error) })
      return null
    }

    const { data: urlData } = supabase.storage.from('artifacts').getPublicUrl(data.path)
    const fileSize = typeof fileContent === 'string' ? Buffer.byteLength(fileContent, 'utf8') : fileContent.length
    return { fileUrl: urlData.publicUrl, artifactType, extension: ext, fileSize }
  } catch (err) {
    log.error('[uploadArtifact] Failed', { module: 'engine/worker', goalId, taskId, error: String(err) })
    return null
  }
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

  const taskPrompt = buildWorkerTaskPrompt(task)

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
      log.error('[runWorkerTask] approval_queue insert failed', { module: 'engine/worker', goalId, taskId: task.id, userId, error: aqInsertErr.message, details: (aqInsertErr as any).details })
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
    }).then(({ error }) => { if (error) log.warn('[runWorkerTask] approval_requested event_log insert failed', { module: 'engine/worker', goalId, taskId: task.id, userId, error: error.message }) })
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
    } catch (e) { log.error('[runWorkerTask] Worker JSON parse fail', { module: 'engine/worker', goalId, taskId: task.id, userId, error: String(e) }) }
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
        // Store the raw output so later tasks in this goal can read it via
        // the PRIOR TASK OUTPUTS prompt section (set at insert time only —
        // artifact immutability untouched).
        body: strippedContent.slice(0, 20000),
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
          // Phase 5: task label is the best available mission-type signal here.
          mission_context: task.label,
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
    log.error('[runWorkerTask] Memo insert failed (non-fatal)', { module: 'engine/worker', goalId, taskId: task.id, userId, error: String(memoErr) })
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
    const allTerminal = (allTasks || []).every((t: any) => terminalStatuses.has(t.status))
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
    log.error('[runWorkerTask] Worker returned failure status', { module: 'engine/worker', goalId, taskId: task.id, userId, reason: failReason })

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
      log.error('[runWorkerTask] Non-exception failure observability write failed', { module: 'engine/worker', goalId, taskId: task.id, userId, error: String(dbErr) })
    }
  }

  return workerResult
  } catch (workerErr: any) {
    // Step 3: Hardened Exception Handling — prevent silent stalls
    const errorMsg = workerErr.message || String(workerErr)
    log.error('[runWorkerTask] CRITICAL FAILURE', { module: 'engine/worker', goalId, taskId: task.id, userId, error: errorMsg })

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
      log.error('[runWorkerTask] Emergency DB update failed', { module: 'engine/worker', goalId, taskId: task.id, userId, error: String(dbErr) })
    }

    throw workerErr
  }
}
