// lib/engine/events.ts
// Central event_log writer. Extracted verbatim from lib/llm-client.ts during
// the Phase 2 god-module split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'
import { truncateString, cleanLargePayload } from '@/lib/utils'
import { resolveDepartmentBySlug } from './departments'
import { log } from '@/lib/log'

export interface LogEventInput {
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
    log.error('[logEvent] Failed to write event', { module: 'engine/events', goalId: input.goal_id, userId: input.created_by, eventType: input.event_type, error: String(err) })
  }
}
