import { createServerSupabaseClient } from '@/lib/supabase'
import type { SuggestedAction } from '@/types'

// ─── schedule_recurring detection (Phase 5, 10x rebuild) ──────────────────────
// Spec §6.1: "Conditionally include schedule_recurring if the mission type
// supports periodic regeneration (sales pipeline summary, weekly competitor
// check, monthly metrics report)." There is no mission-type taxonomy anywhere
// in the codebase (confirmed: no mission_type/goal_type column or field
// exists) — this is a best-effort keyword classifier over whatever free text
// is available at generation time (goal title/founder_input, task label,
// artifact title). Intentionally conservative: false negatives (missing a
// schedule_recurring suggestion) are low-cost per spec's own framing ("the
// full list is always available on the artefact card"); false positives
// (suggesting recurrence for a one-off mission) are the worse failure mode,
// so the patterns are narrow rather than broad.
const RECURRING_MISSION_PATTERNS: Array<{ pattern: RegExp; recurrence: string; intervalLabel: string }> = [
  { pattern: /\b(sales\s*pipeline|pipeline\s*summary|deal\s*(flow|summary))\b/i, recurrence: 'RRULE:FREQ=WEEKLY', intervalLabel: 'week' },
  { pattern: /\bcompetitor\b|\bcompetitive\s*(check|analysis|scan|report)\b/i, recurrence: 'RRULE:FREQ=WEEKLY', intervalLabel: 'week' },
  { pattern: /\b(metrics|kpi|performance)\s*report\b|\bmonthly\s*(metrics|report)\b/i, recurrence: 'RRULE:FREQ=MONTHLY', intervalLabel: 'month' },
]

function detectRecurringMissionType(text: string): { recurrence: string; intervalLabel: string } | null {
  for (const rule of RECURRING_MISSION_PATTERNS) {
    if (rule.pattern.test(text)) return { recurrence: rule.recurrence, intervalLabel: rule.intervalLabel }
  }
  return null
}

// Generate standard generic actions per §6.1
export async function generateAndInsertSuggestedActions({
  source_entity_type,
  source_entity_id,
  goal_id,
  artifact_type,
  file_url,
  artifact_title,
  mission_context,
  created_by
}: {
  source_entity_type: 'artifact' | 'mission_report' | 'memo'
  source_entity_id: string
  goal_id?: string | null
  artifact_type?: string
  file_url?: string
  artifact_title?: string
  // Optional free text (goal title + founder_input, task label, etc.) used
  // only for schedule_recurring mission-type detection. Falls back to
  // artifact_title alone when the caller doesn't have richer context handy —
  // see call sites in lib/engine/{worker,orchestrator}.ts for what's passed.
  mission_context?: string
  created_by: string
}): Promise<string[]> {
  const supabase = createServerSupabaseClient()
  const actionsToInsert: Partial<SuggestedAction>[] = []

  // Always include make_changes per §6.1
  actionsToInsert.push({
    source_entity_type,
    source_entity_id,
    action_slug: 'make_changes',
    label: 'Make changes',
    reasoning: 'Standard next step to refine the output',
    payload: {
      artifact_id: source_entity_type === 'artifact' ? source_entity_id : null,
      goal_id: goal_id || null,
    },
    required_tool: null,
    required_inputs: [],
    risk_level: 'low',
    execution_path: 'internal',
    created_by
  })

  // Always include add_to_memo per §6.1
  actionsToInsert.push({
    source_entity_type,
    source_entity_id,
    action_slug: 'add_to_memo',
    label: 'Save as a decision in the Memo',
    reasoning: 'Add key findings to long-term memory for future tasks',
    payload: {
      artifact_id: source_entity_type === 'artifact' ? source_entity_id : null,
      goal_id: goal_id || null,
      title: artifact_title || 'Output from mission',
      content: `Key output from mission${goal_id ? ` (goal: ${goal_id})` : ''}. Saved as a decision for future reference.`,
    },
    required_tool: null,
    required_inputs: [],
    risk_level: 'low',
    execution_path: 'internal',
    created_by
  })

  // Conditionally include save_to_kb if not already in KB
  if (source_entity_type === 'artifact' && file_url) {
    actionsToInsert.push({
      source_entity_type,
      source_entity_id,
      action_slug: 'save_to_kb',
      label: 'Save to Knowledge Base',
      reasoning: 'Store this output so Orc can reference it in future missions',
      payload: {
        artifact_id: source_entity_id,
        file_url,
        artifact_type: artifact_type || 'document',
        title: artifact_title || 'Artifact from Crost',
        goal_id: goal_id || null,
      },
      required_tool: null,
      required_inputs: [],
      risk_level: 'low',
      execution_path: 'internal',
      created_by
    })
  }

  // Conditionally include send_to_email for shareable file types
  const shareable = ['presentation', 'document', 'pdf', 'spreadsheet', 'image']
  if (artifact_type && shareable.includes(artifact_type) && file_url) {
    const rawFileName = file_url.split('/').pop() || 'attachment'
    const ext: Record<string, string> = {
      presentation: 'pptx', document: 'docx', spreadsheet: 'xlsx', pdf: 'pdf', image: 'png'
    }
    const friendlyName = artifact_title
      ? `${artifact_title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}.${ext[artifact_type] || 'file'}`
      : rawFileName

    actionsToInsert.push({
      source_entity_type,
      source_entity_id,
      action_slug: 'send_to_email',
      label: 'Send to my email',
      reasoning: 'Shareable file detected — easily send it to your inbox to review later',
      payload: {
        artifact_id: source_entity_type === 'artifact' ? source_entity_id : null,
        file_url,
        file_name: friendlyName,
        artifact_type: artifact_type || 'document',
        subject: `${artifact_title || 'Your Crost output'} — ready to review`,
        goal_id: goal_id || null,
      },
      required_tool: 'gmail',
      required_inputs: ['destination_email'],
      risk_level: 'medium',
      execution_path: 'external',
      created_by
    })
  }

  // Conditionally include schedule_recurring per §6.1 — see
  // RECURRING_MISSION_PATTERNS / detectRecurringMissionType above for the
  // classification approach and its caveats.
  const classificationText = [mission_context, artifact_title].filter(Boolean).join(' ')
  const recurringMatch = classificationText ? detectRecurringMissionType(classificationText) : null
  if (recurringMatch) {
    actionsToInsert.push({
      source_entity_type,
      source_entity_id,
      action_slug: 'schedule_recurring',
      label: `Run this every ${recurringMatch.intervalLabel}`,
      reasoning: 'This looks like a recurring mission type — Orc can keep it fresh automatically',
      payload: {
        artifact_id: source_entity_type === 'artifact' ? source_entity_id : null,
        goal_id: goal_id || null,
        title: artifact_title || 'Recurring Review',
        recurrence: recurringMatch.recurrence,
      },
      required_tool: null,
      required_inputs: [],
      risk_level: 'low',
      execution_path: 'internal',
      created_by
    })
  }

  const { data, error } = await supabase
    .from('suggested_actions')
    .insert(actionsToInsert)
    .select('id')

  if (error) {
    console.error('[generateSuggestedActions] Failed to insert:', error)
    return []
  }

  return (data || []).map((a: any) => a.id)
}
