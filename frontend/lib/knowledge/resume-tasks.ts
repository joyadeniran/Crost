// lib/knowledge/resume-tasks.ts
// Root-cause fix RC2 of the "self-destructive flow": when a knowledge-base
// upload finishes processing, resume the goal's tasks that were blocked in
// needs_data. Previously nothing fired on completion, so blocked tasks (and
// everything depending on them) waited forever.
//
// Ownership: callers must pass the authenticated uploader's userId; every
// query here is scoped by goal_id AND created_by. Never call this with a
// body-supplied userId outside the internal-secret pattern.

import { createServerSupabaseClient } from '@/lib/supabase'
import { log } from '@/lib/log'

export async function resumeBlockedTasksAfterUpload(goalId: string, userId: string): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()

    const { data: blockedTasks } = await supabase
      .from('goal_tasks')
      .select('task_id, status, orc_notes')
      .eq('goal_id', goalId)
      .eq('created_by', userId)
      .eq('status', 'needs_data')

    if (!blockedTasks || blockedTasks.length === 0) return

    // Reset each blocked task to 'planned' so the CHAIN_REACTION handler
    // (which only considers planned/pending tasks) picks it up.
    for (const t of blockedTasks as any[]) {
      const existingNotes = Array.isArray(t.orc_notes) ? t.orc_notes : []
      await supabase
        .from('goal_tasks')
        .update({
          status: 'planned',
          orc_notes: [
            ...existingNotes,
            {
              ts: new Date().toISOString(),
              note: 'Founder uploaded new data to the knowledge base. Task automatically resumed.',
              action_taken: 'DATA_UPLOADED_RESUMING',
            },
          ],
        })
        .eq('goal_id', goalId)
        .eq('task_id', t.task_id)
    }

    // Fire the chain reaction — dual-mode auth via the internal secret,
    // mirroring the recursive dispatch pattern in goals/[id]/dispatch.
    const internalSecret = process.env.WORKER_INTERNAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/goals/${goalId}/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crost-internal-secret': internalSecret,
      },
      body: JSON.stringify({ task_id: 'CHAIN_REACTION' }),
    })
  } catch (err) {
    // Non-fatal by contract: a failed resume must never break upload processing.
    log.warn('[resumeBlockedTasksAfterUpload] Failed (non-fatal)', {
      module: 'knowledge/resume-tasks',
      goalId,
      userId,
      error: String(err),
    })
  }
}
