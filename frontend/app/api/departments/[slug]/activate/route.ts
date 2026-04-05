// POST /api/departments/[slug]/activate
// Transitions: draft → review → active
// Onyx is attempted best-effort; on failure we fall back to DIRECT_LLM mode
// so departments work even without Onyx running.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { onyxClient } from '@/lib/onyx-client'
import type { Department } from '@/types'

interface Params { params: { slug: string } }

const STAGE_TRANSITIONS: Record<string, string> = {
  draft: 'review',
  review: 'active',
}

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createServerSupabaseClient()

    const { data: dept, error } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .single()

    if (error || !dept) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    }

    const nextStage = STAGE_TRANSITIONS[dept.activation_stage]
    if (!nextStage) {
      return NextResponse.json(
        { error: `Cannot advance a department in "${dept.activation_stage}" stage.`, code: 'INVALID_STAGE' },
        { status: 422 }
      )
    }

    if ((dept.capabilities as string[]).length === 0) {
      return NextResponse.json(
        { error: 'Department must have at least one capability declared.', code: 'NO_CAPABILITIES' },
        { status: 422 }
      )
    }
    if (!dept.persona_prompt || dept.persona_prompt.length < 50) {
      return NextResponse.json(
        { error: 'Persona prompt must be at least 50 characters.', code: 'PROMPT_TOO_SHORT' },
        { status: 422 }
      )
    }

    const updates: Record<string, unknown> = { activation_stage: nextStage }
    let onyxMode = 'direct_llm'

    // When transitioning to active: attempt Onyx persona creation (best-effort)
    if (nextStage === 'active') {
      try {
        const persona = await onyxClient.createPersona(dept as Department)
        updates.onyx_persona_id = persona.id
        onyxMode = 'onyx'
      } catch (onyxErr) {
        // Onyx unavailable — fall back to DIRECT_LLM mode
        console.warn(`[activate] Onyx unavailable for ${dept.slug}, using DIRECT_LLM:`, onyxErr)
        updates.onyx_persona_id = `direct_llm:${dept.slug}`
      }
    }

    const { data: updated, error: updateErr } = await supabase
      .from('departments')
      .update(updates)
      .eq('id', dept.id)
      .select()
      .single()

    if (updateErr) throw updateErr

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'department_activated',
      description: `Department "${dept.name}" promoted: ${dept.activation_stage} → ${nextStage}${onyxMode === 'direct_llm' ? ' (Direct LLM mode — Onyx unavailable)' : ''}`,
      metadata: { from: dept.activation_stage, to: nextStage, mode: onyxMode },
    })

    return NextResponse.json({ data: updated, mode: onyxMode })
  } catch (err) {
    console.error('[POST /api/departments/:slug/activate]', err)
    return NextResponse.json({ error: 'Failed to activate department' }, { status: 500 })
  }
}
