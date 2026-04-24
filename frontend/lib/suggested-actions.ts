import { createServerSupabaseClient } from '@/lib/supabase'
import type { SuggestedAction } from '@/types'

// Generate standard generic actions per §6.1
export async function generateAndInsertSuggestedActions({
  source_entity_type,
  source_entity_id,
  goal_id,
  artifact_type,
  file_url,
  created_by
}: {
  source_entity_type: 'artifact' | 'mission_report' | 'memo'
  source_entity_id: string
  goal_id?: string | null
  artifact_type?: string
  file_url?: string
  created_by: string
}): Promise<string[]> {
  const supabase = createServerSupabaseClient()
  const actionsToInsert: Partial<SuggestedAction>[] = []

  // Always include per §6.1
  actionsToInsert.push({
    source_entity_type,
    source_entity_id,
    action_slug: 'make_changes',
    label: 'Make changes',
    reasoning: 'Standard next step to refine the output',
    required_tool: null,
    required_inputs: [],
    risk_level: 'low',
    created_by
  })

  actionsToInsert.push({
    source_entity_type,
    source_entity_id,
    action_slug: 'add_to_memo',
    label: 'Save as a decision in the Memo',
    reasoning: 'Add key findings to long-term memory for future tasks',
    required_tool: null,
    required_inputs: [],
    risk_level: 'low',
    created_by
  })

  // Conditionally include send_to_email
  const shareable = ['presentation', 'document', 'pdf', 'spreadsheet', 'image']
  if (artifact_type && shareable.includes(artifact_type)) {
    actionsToInsert.push({
      source_entity_type,
      source_entity_id,
      action_slug: 'send_to_email',
      label: 'Send to my email',
      reasoning: 'Shareable file detected — easily send it to your inbox to review later',
      required_tool: 'gmail',
      required_inputs: [],
      risk_level: 'medium',
      created_by
    })
  }

  // Insert all actions into the suggested_actions table
  const { data, error } = await supabase
    .from('suggested_actions')
    .insert(actionsToInsert)
    .select('id')

  if (error) {
    console.error('[generateSuggestedActions] Failed to insert:', error)
    return []
  }

  return (data || []).map(a => a.id)
}
