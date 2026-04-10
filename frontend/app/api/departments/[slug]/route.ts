import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

interface Params { params: { slug: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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

    // Persona prompt or tools change → reset to review
    const requiresReview = (parsed.persona_prompt !== undefined || parsed.tools !== undefined)
      && dept.activation_stage === 'active'

    const updates: Record<string, unknown> = { ...parsed }
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
      metadata: { fields: Object.keys(parsed), reset_to_review: requiresReview },
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
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

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
