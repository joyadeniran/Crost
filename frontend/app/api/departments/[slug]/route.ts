// GET /api/departments/[slug]    — get single department
// PATCH /api/departments/[slug]  — update department (with activation_stage reset logic)
// DELETE /api/departments/[slug] — soft deprecation (default) or hard delete (?hard=true)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { onyxClient } from '@/lib/onyx-client'
import { z } from 'zod'

interface Params { params: { slug: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .single()
    if (error || !data) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to fetch department' }, { status: 500 })
  }
}

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  persona_prompt: z.string().min(50).optional(),
  tone_override: z.string().nullable().optional(),
  capabilities: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  model_provider: z.enum(['local', 'gemini', 'claude', 'groq']).optional(),
  model_name: z.string().optional(),
  tools: z.array(z.string()).optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json()
    const parsed = UpdateSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data: dept } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .single()
    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    // Persona prompt or tools change → reset to review
    const requiresReview = (parsed.persona_prompt !== undefined || parsed.tools !== undefined)
      && dept.activation_stage === 'active'

    const updates: Record<string, unknown> = { ...parsed }
    if (requiresReview) updates.activation_stage = 'review'

    const { data: updated, error: updateErr } = await supabase
      .from('departments')
      .update(updates)
      .eq('slug', params.slug)
      .select()
      .single()
    if (updateErr) throw updateErr

    // Sync name or prompt changes to Onyx (best-effort)
    if (dept.onyx_persona_id && dept.onyx_persona_id !== 'SYNC_FAILED') {
      if (parsed.name !== undefined || parsed.persona_prompt !== undefined) {
        try {
          await onyxClient.updatePersona(dept.onyx_persona_id, {
            name: parsed.name,
            persona_prompt: parsed.persona_prompt,
          })
        } catch (err) {
          console.error('[PATCH] Onyx persona update failed:', err)
        }
      }
    }

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'department_updated',
      description: `Department "${dept.name}" updated`,
      metadata: { fields: Object.keys(parsed), reset_to_review: requiresReview },
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    if (err instanceof Error && err.message.includes('not found')) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    console.error('[PATCH /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const supabase = createServerSupabaseClient()
    const isHardDelete = new URL(req.url).searchParams.get('hard') === 'true'

    const { data: dept } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .single()
    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    if (isHardDelete) {
      if (dept.activation_stage !== 'deprecated') {
        return NextResponse.json(
          { error: 'Department must be deprecated before hard deletion.', code: 'MUST_DEPRECATE_FIRST' },
          { status: 400 }
        )
      }
      await supabase.from('departments').delete().eq('id', dept.id)
      if (dept.onyx_persona_id && dept.onyx_persona_id !== 'SYNC_FAILED') {
        try { await onyxClient.deletePersona(dept.onyx_persona_id) } catch { /* non-fatal */ }
      }
      await supabase.from('event_log').insert({
        department_slug: dept.slug,
        event_type: 'department_deleted',
        description: `Department "${dept.name}" permanently deleted`,
        metadata: {},
      })
      return NextResponse.json({ success: true, data: { deleted: true } })
    }

    // Soft deprecation
    await supabase
      .from('departments')
      .update({ activation_stage: 'deprecated', status: 'idle' })
      .eq('id', dept.id)

    // Auto-reject all pending approvals
    await supabase
      .from('approval_queue')
      .update({ status: 'rejected', decided_by: 'system_deprecation', decided_at: new Date().toISOString() })
      .eq('department_id', dept.id)
      .eq('status', 'pending')

    if (dept.onyx_persona_id && dept.onyx_persona_id !== 'SYNC_FAILED') {
      try { await onyxClient.deactivatePersona(dept.onyx_persona_id) } catch { /* non-fatal */ }
    }

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'department_deprecated',
      description: `Department "${dept.name}" deprecated`,
      metadata: {},
    })

    return NextResponse.json({ success: true, data: { deprecated: true } })
  } catch (err) {
    console.error('[DELETE /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to deprecate department' }, { status: 500 })
  }
}
