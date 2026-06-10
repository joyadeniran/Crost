import { createServerSupabaseClient } from '@/lib/supabase'
import type { SuggestedAction } from '@/types'

// Generate standard generic actions per §6.1
export async function generateAndInsertSuggestedActions({
  source_entity_type,
  source_entity_id,
  goal_id,
  artifact_type,
  file_url,
  artifact_title,
  created_by
}: {
  source_entity_type: 'artifact' | 'mission_report' | 'memo'
  source_entity_id: string
  goal_id?: string | null
  artifact_type?: string
  file_url?: string
  artifact_title?: string
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
