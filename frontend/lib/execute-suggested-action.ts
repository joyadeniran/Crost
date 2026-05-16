/**
 * executeSuggestedAction — Crost Spec §6.1, §15.7
 *
 * Gateway entry point for Suggested Action execution.
 * Called from SuggestedActionChips when a founder taps a suggestion chip
 * (e.g. "Send to email", "Add to memo", "Make changes").
 *
 * Steps:
 * 1. Load the SuggestedAction row, validate status == 'generated'.
 * 2. Map action_slug → (service, action, params).
 * 3. Route direct-action slugs through departmentId: 'executive'.
 * 4. Call executeToolCall(...).
 * 5. Thread outcomes back into the SuggestedAction row (status → completed/failed).
 * 6. Emit suggested_action_* event_log entries.
 */

import { createServerSupabaseClient } from '@/lib/supabase'
import { executeToolCall, ToolCallPayload } from '@/lib/tools/execute-tool-call'
import { logEvent } from '@/lib/llm-client'

export type SuggestedActionStatus =
  | 'generated'
  | 'dispatched'
  | 'completed'
  | 'failed'
  | 'dismissed'

interface ExecuteSuggestedActionInput {
  actionId: string
  userId: string
  goalId?: string | null
}

// ─── Action-slug → tool-call mapping ──────────────────────────────────────────

const ACTION_SLUG_MAP: Record<
  string,
  { service: string; action: string; buildParams: (ctx: any) => Record<string, any> }
> = {
  send_to_email: {
    service: 'gmail',
    action: 'send_email',
    buildParams: (ctx) => ({
      to: ctx.target_email ?? ctx.recipient_email ?? '',
      subject: ctx.subject ?? 'From Crost',
      body: ctx.body ?? ctx.summary ?? '',
    }),
  },
  add_to_memo: {
    service: 'internal',
    action: 'company_memos',
    buildParams: (ctx) => ({
      title: ctx.title ?? 'Suggested Action Memo',
      body: ctx.body ?? ctx.summary ?? '',
      tags: ctx.tags ?? ['suggested_action'],
      priority: ctx.priority ?? 'normal',
    }),
  },
  make_changes: {
    service: 'internal',
    action: 'make_changes_workflow',
    buildParams: (ctx) => ({
      artifact_id: ctx.artifact_id,
    }),
  },
  send_to_contact: {
    service: 'hubspot',
    action: 'create_contact',
    buildParams: (ctx) => ({
      email: ctx.contact_email ?? ctx.target_email ?? '',
      firstname: ctx.first_name ?? '',
      lastname: ctx.last_name ?? '',
      notes: ctx.body ?? '',
    }),
  },
  save_to_kb: {
    service: 'internal',
    action: 'knowledge_base_import',
    buildParams: (ctx) => ({
      artifact_id: ctx.artifact_id,
    }),
  },
  schedule_recurring: {
    service: 'googlecalendar',
    action: 'create_event',
    buildParams: (ctx) => ({
      summary: ctx.title ?? 'Recurring Review',
      start: ctx.start_date ?? new Date().toISOString(),
      recurrence: ctx.recurrence ?? 'RRULE:FREQ=WEEKLY',
    }),
  },
  generate_companion: {
    service: 'internal',
    action: 'save_document',
    buildParams: (ctx) => ({
      title: ctx.title ?? 'Companion Document',
      content: ctx.companion_content ?? ctx.body ?? '',
    }),
  },
  share_with_teammate: {
    service: 'slack',
    action: 'post_message',
    buildParams: (ctx) => ({
      channel: ctx.channel ?? '#general',
      text: ctx.body ?? ctx.summary ?? '',
    }),
  },
  draft_followup: {
    service: 'gmail',
    action: 'send_email',
    buildParams: (ctx) => ({
      to: ctx.target_email ?? '',
      subject: ctx.subject ?? 'Follow-up',
      body: ctx.followup_body ?? ctx.body ?? '',
    }),
  },
  start_new_mission: {
    // Special: no tool call; creates a new goal instead
    service: 'internal',
    action: 'start_goal',
    buildParams: (ctx) => ({
      founder_input: ctx.goal_prompt ?? ctx.body ?? '',
    }),
  },
}

// ─── Core gateway ─────────────────────────────────────────────────────────────

export async function executeSuggestedAction(
  input: ExecuteSuggestedActionInput
): Promise<{ success: boolean; error?: string; result?: any }> {
  const { actionId, userId, goalId } = input
  const supabase = createServerSupabaseClient()

  // 1. Load the SuggestedAction row
  const { data: actionRow, error: fetchErr } = await supabase
    .from('suggested_actions')
    .select('*')
    .eq('id', actionId)
    .eq('created_by', userId)
    .single()

  if (fetchErr || !actionRow) {
    return { success: false, error: `Suggested action not found: ${fetchErr?.message}` }
  }

  // Accept both 'suggested' (default from generateAndInsertSuggestedActions)
  // and 'generated' (legacy label) as valid start states.
  const EXECUTABLE_STATUSES = new Set(['suggested', 'generated', 'tapped'])
  if (!EXECUTABLE_STATUSES.has(actionRow.status)) {
    return { success: false, error: `Action already ${actionRow.status}` }
  }

  // 2. Map action_slug
  const mapping = ACTION_SLUG_MAP[actionRow.action_slug]
  if (!mapping) {
    await markFailed(supabase, actionId, userId, `Unknown action slug: ${actionRow.action_slug}`)
    return { success: false, error: `Unknown action slug: ${actionRow.action_slug}` }
  }

  // 3. Mark as dispatched
  await supabase
    .from('suggested_actions')
    .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
    .eq('id', actionId)

  // 4. Special handling for make_changes workflow
  if (actionRow.action_slug === 'make_changes') {
    try {
      const artifactId = actionRow.payload?.artifact_id
      if (!artifactId) {
        await markFailed(supabase, actionId, userId, 'artifact_id required for make_changes')
        return { success: false, error: 'artifact_id required for make_changes' }
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
      const response = await fetch(`${appUrl}/api/artifacts/${artifactId}/make-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pass the user's auth cookie if available
          'Cookie': '', // Credentials will be sent automatically in client calls
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Make-changes API failed: ${response.status} ${errorText}`)
      }

      const result = await response.json()

      await supabase
        .from('suggested_actions')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          result_artifact_id: result.data?.artifact_id,
          result_summary: `Revision task created: ${result.data?.new_task_id}`,
        })
        .eq('id', actionId)

      await emitEvent(userId, 'suggested_action_completed', {
        action_id: actionId,
        action_slug: actionRow.action_slug,
        new_task_id: result.data?.new_task_id,
      })

      return { success: true, result }
    } catch (err: any) {
      const message = err?.message ?? String(err)
      await markFailed(supabase, actionId, userId, message)
      return { success: false, error: message }
    }
  }

  // 4. Build tool payload (non-make_changes actions)
  const params = mapping.buildParams(actionRow.payload ?? {})
  const toolCall: ToolCallPayload = {
    service: mapping.service,
    action: mapping.action,
    params,
    reasoning: actionRow.reasoning ?? `Suggested action: ${actionRow.action_slug}`,
    risk: actionRow.risk_level ?? 'medium',
    requiresApproval: false,
  }

  // 5. Execute (route direct actions through executive)
  try {
    const result = await executeToolCall({
      userId,
      departmentId: 'executive',
      taskId: actionRow.task_id ?? actionId,
      goalId: goalId ?? actionRow.goal_id ?? null,
      toolCall,
    })

    // 6. Thread outcomes back
    if ((result as any).status === 'missing_connection') {
      await markFailed(supabase, actionId, userId, (result as any).message ?? 'Tool not connected')
      return { success: false, error: (result as any).message ?? 'Tool not connected' }
    }

    if ((result as any).status === 'permission_denied') {
      await markFailed(supabase, actionId, userId, (result as any).message ?? 'Permission denied')
      return { success: false, error: (result as any).message ?? 'Permission denied' }
    }

    if ((result as any).status === 'requires_approval') {
      await supabase
        .from('suggested_actions')
        .update({ status: 'dispatched', approval_id: (result as any).execution_id })
        .eq('id', actionId)

      await emitEvent(userId, 'suggested_action_approval_needed', {
        action_id: actionId,
        action_slug: actionRow.action_slug,
        approval_id: (result as any).execution_id,
      })

      return { success: true, result: { status: 'approval_needed', execution_id: (result as any).execution_id } }
    }

    // Completed successfully
    const resultSummary = typeof (result as any).data === 'string'
      ? (result as any).data.slice(0, 500)
      : ((result as any).summary || `Success: ${mapping.action} completed.`);

    await supabase
      .from('suggested_actions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result_summary: resultSummary,
      })
      .eq('id', actionId)

    await emitEvent(userId, 'suggested_action_completed', {
      action_id: actionId,
      action_slug: actionRow.action_slug,
      service: mapping.service,
      action: mapping.action,
    })

    return { success: true, result }
  } catch (err: any) {
    const message = err?.message ?? String(err)
    await markFailed(supabase, actionId, userId, message)
    return { success: false, error: message }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function markFailed(
  supabase: any,
  actionId: string,
  userId: string,
  reason: string
) {
  await supabase
    .from('suggested_actions')
    .update({ status: 'failed', failed_reason: reason })
    .eq('id', actionId)

  await emitEvent(userId, 'suggested_action_failed', {
    action_id: actionId,
    reason,
  })
}

async function emitEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, any>
) {
  try {
    await logEvent({
      event_type: eventType,
      description: eventType.replace(/_/g, ' '),
      created_by: userId,
      metadata,
    })
  } catch (e) {
    // Non-fatal: event logging must not block action execution
    console.warn('[executeSuggestedAction] logEvent failed:', e)
  }
}
