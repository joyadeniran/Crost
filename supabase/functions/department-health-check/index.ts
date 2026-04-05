// Supabase Edge Function: department-health-check
// Runs every 15 minutes via pg_cron.
// Repairs orphaned departments where Onyx persona creation previously failed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const ONYX_API_URL = Deno.env.get('ONYX_API_URL') ?? 'http://onyx-backend:8080'
const ONYX_API_KEY = Deno.env.get('ONYX_API_KEY') ?? ''

async function createOnyxPersona(dept: Record<string, unknown>): Promise<{ id: string }> {
  const response = await fetch(`${ONYX_API_URL}/api/persona`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ONYX_API_KEY}`
    },
    body: JSON.stringify({
      name: dept.name,
      description: dept.persona_prompt,
      num_chunks: 10,
      llm_relevance_filter: true,
      is_public: false,
      llm_model_provider_override: null,
      llm_model_version_override: null,
    })
  })

  if (!response.ok) {
    throw new Error(`Onyx persona creation failed: ${response.status} ${await response.text()}`)
  }

  return response.json()
}

async function logEvent(
  eventType: string,
  departmentId: string,
  departmentSlug: string,
  description: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from('event_log').insert({
    department_id: departmentId,
    department_slug: departmentSlug,
    event_type: eventType,
    description,
    metadata: metadata ?? {}
  })
}

async function repairOrphanedDepartments() {
  // Find departments where onyx_persona_id is NULL or 'SYNC_FAILED'
  // and activation_stage is NOT 'deprecated'
  const { data: orphaned, error } = await supabase
    .from('departments')
    .select('*')
    .or('onyx_persona_id.is.null,onyx_persona_id.eq.SYNC_FAILED')
    .neq('activation_stage', 'deprecated')

  if (error) {
    console.error('Error fetching orphaned departments:', error.message)
    return { repaired: 0, failed: 0 }
  }

  if (!orphaned || orphaned.length === 0) {
    return { repaired: 0, failed: 0 }
  }

  let repaired = 0
  let failed = 0

  for (const dept of orphaned) {
    try {
      const persona = await createOnyxPersona(dept)

      await supabase
        .from('departments')
        .update({ onyx_persona_id: persona.id })
        .eq('id', dept.id)

      await logEvent(
        'department_updated',
        dept.id,
        dept.slug,
        `Onyx persona sync repaired for department "${dept.name}"`,
        { onyx_persona_id: persona.id }
      )

      repaired++
      console.log(`Repaired: ${dept.slug}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await logEvent(
        'error',
        dept.id,
        dept.slug,
        `Onyx sync repair failed: ${message}`,
        { step: 'onyx_persona_repair' }
      )
      failed++
      console.error(`Failed to repair ${dept.slug}:`, message)
    }
  }

  return { repaired, failed }
}

Deno.serve(async (_req) => {
  const result = await repairOrphanedDepartments()
  console.log(`Health check complete: ${result.repaired} repaired, ${result.failed} failed`)
  return new Response(JSON.stringify(result), { status: 200 })
})
