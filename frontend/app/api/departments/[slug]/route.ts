import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

interface Params { params: { slug: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(_req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .eq('created_by', user.id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to fetch department' }, { status: 500 })
  }
}

const UpdateSchema = z.object({
  persona_prompt: z.string().min(50).optional(),
  tone_override: z.string().nullable().optional(),
  capabilities: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  model_provider: z.enum(['local', 'gemini', 'claude', 'groq']).optional(),
  model_name: z.string().optional(),
  tools: z.array(z.string()).optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  reset_to_template: z.boolean().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const body = await req.json()
    const parsed = UpdateSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data: dept } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .eq('created_by', user.id)
      .single()
    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    if (dept.is_orchestrator) {
      return NextResponse.json({ error: 'Orchestrator settings are not editable from this route yet.' }, { status: 403 })
    }

    const { reset_to_template, ...editableFields } = parsed

    if (reset_to_template) {
      const { data: template } = await supabase
        .from('departments')
        .select('*')
        .eq('slug', params.slug)
        .is('created_by', null)
        .single()

      if (!template) {
        return NextResponse.json({ error: 'Base template not found for this department' }, { status: 404 })
      }

      const resetPayload = {
        persona_prompt: template.persona_prompt,
        tone_override: template.tone_override,
        capabilities: template.capabilities,
        restrictions: template.restrictions,
        tools: template.tools,
        model_provider: template.model_provider,
        model_name: template.model_name,
        icon: template.icon,
        color: template.color,
        activation_stage: 'review',
        status: 'idle',
      }

      const { data: resetDept, error: resetErr } = await supabase
        .from('departments')
        .update(resetPayload)
        .eq('slug', params.slug)
        .eq('created_by', user.id)
        .select()
        .single()

      if (resetErr) throw resetErr

      await supabase.from('event_log').insert({
        department_id: dept.id,
        department_slug: dept.slug,
        event_type: 'department_updated',
        description: `Department "${dept.name}" reset to base template`,
        metadata: { reset_to_template: true },
        created_by: user.id
      })

      return NextResponse.json({ data: resetDept })
    }

    // Persona prompt or tools change → reset to review
    const requiresReview = (editableFields.persona_prompt !== undefined || editableFields.tools !== undefined)
      && dept.activation_stage === 'active'

    const updates: Record<string, unknown> = { ...editableFields }
    if (requiresReview) updates.activation_stage = 'review'

    const { data: updated, error: updateErr } = await supabase
      .from('departments')
      .update(updates)
      .eq('slug', params.slug)
      .eq('created_by', user.id)
      .select()
      .single()
    if (updateErr) throw updateErr



    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'department_updated',
      description: `Department "${dept.name}" updated`,
      metadata: { fields: Object.keys(editableFields), reset_to_review: requiresReview },
      created_by: user.id
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[PATCH /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const supabase = createServerSupabaseClient()
    const isHardDelete = new URL(req.url).searchParams.get('hard') === 'true'

    const { data: dept } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .eq('created_by', user.id)
      .single()
    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    if (isHardDelete) {
      if (dept.activation_stage !== 'deprecated') {
        return NextResponse.json(
          { error: 'Department must be deprecated before hard deletion.', code: 'MUST_DEPRECATE_FIRST' },
          { status: 400 }
        )
      }
      await supabase.from('departments').delete().eq('id', dept.id).eq('created_by', user.id)
      

      
      await supabase.from('event_log').insert({
        department_slug: dept.slug,
        event_type: 'department_deleted',
        description: `Department "${dept.name}" permanently deleted`,
        metadata: {},
        created_by: user.id
      })
      return NextResponse.json({ success: true, data: { deleted: true } })
    }

    // Soft deprecation
    await supabase
      .from('departments')
      .update({ activation_stage: 'deprecated', status: 'idle' })
      .eq('id', dept.id)
      .eq('created_by', user.id)

    // Auto-reject all pending approvals
    await supabase
      .from('approval_queue')
      .update({ status: 'rejected', decided_by: 'system_deprecation', decided_at: new Date().toISOString() })
      .eq('department_id', dept.id)
      .eq('status', 'pending')
      .eq('created_by', user.id)

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'department_deprecated',
      description: `Department "${dept.name}" deprecated`,
      metadata: {},
      created_by: user.id
    })

    return NextResponse.json({ success: true, data: { deprecated: true } })
  } catch (err) {
    console.error('[DELETE /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to deprecate department' }, { status: 500 })
  }
}
