// GET /api/departments  — list all non-deprecated departments
// POST /api/departments — create a new department (6-step spec flow)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { RESERVED_SLUGS } from '@/lib/department-lifecycle'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') ?? 'default'
    const activeOnly = searchParams.get('active_only') === 'true'
    const includeOrchestrator = searchParams.get('include_orchestrator') === 'true'

    // For template browsing (during onboarding), allow unauthenticated access
    // These are public template departments that anyone can view
    if (scope === 'templates') {
      let query = supabase
        .from('departments')
        .select('*')
        .is('created_by', null) // Only fetch templates (created_by IS NULL)
        .neq('activation_stage', 'deprecated')
        .order('created_at')
      if (activeOnly) query = query.eq('activation_stage', 'active')
      if (!includeOrchestrator) query = query.eq('is_orchestrator', false)
      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    // For user departments, require authentication
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    // Return user's own departments OR global templates
    let query = supabase
      .from('departments')
      .select('*')
      .or(`created_by.eq.${user.id},created_by.is.null`)
      .neq('activation_stage', 'deprecated')
      .order('created_at')
    if (activeOnly) query = query.eq('activation_stage', 'active')
    if (!includeOrchestrator) query = query.eq('is_orchestrator', false)
    const { data, error } = await query
    if (error) throw error

    const userDepts = (data ?? []).filter((d: any) => d.created_by === user.id)
    const templateDepts = (data ?? []).filter((d: any) => d.created_by === null)
    const userSlugs = new Set(userDepts.map((dept: any) => dept.slug))

    let result = userDepts.length > 0 ? userDepts : templateDepts
    if (scope === 'user') {
      result = userDepts
    } else if (scope === 'all') {
      result = [
        ...userDepts,
        ...templateDepts.filter((dept: any) => !userSlugs.has(dept.slug)),
      ]
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[GET /api/departments]', err)
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 })
  }
}

// Server-side schema — no async refine (tools validated against DB directly below)
const CreateSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must be under 50 characters')
    .regex(/^[a-zA-Z0-9 _-]+$/, 'Name can only contain letters, numbers, spaces, hyphens, and underscores'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50, 'Slug must be under 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only')
    .refine((s) => !RESERVED_SLUGS.includes(s), (s) => ({ message: `"${s}" is reserved by Crost` })),
  persona_prompt: z.string().min(50, 'Persona prompt must be at least 50 characters'),
  model_provider: z.enum(['local', 'gemini', 'claude', 'groq']),
  model_name: z.string().min(1, 'Model name is required'),
  tools: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).default([]),
  restrictions: z.array(z.string()).default([]),
  tone_override: z.string().optional(),
  icon: z.string().default('briefcase'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex code').default('#6366f1'),
})

const CloneTemplateSchema = z.object({
  template_slug: z.string().min(2).max(50),
})

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const body = await req.json()

    if (body?.template_slug) {
      const parsedTemplate = CloneTemplateSchema.parse(body)

      const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
      if (idempotency.kind === 'response') return idempotency.response

      const { data: existingUserDept } = await supabase
        .from('departments')
        .select('id')
        .eq('slug', parsedTemplate.template_slug)
        .eq('created_by', user.id)
        .maybeSingle()
      if (existingUserDept) {
        return NextResponse.json(
          {
            success: false,
            error: `You already have the "${parsedTemplate.template_slug}" department.`,
            code: 'DEPARTMENT_ALREADY_EXISTS',
          },
          { status: 409 }
        )
      }

      const { data: template, error: templateError } = await supabase
        .from('departments')
        .select('*')
        .eq('slug', parsedTemplate.template_slug)
        .is('created_by', null)
        .eq('is_orchestrator', false)
        .single()
      if (templateError || !template) {
        return NextResponse.json({ success: false, error: 'Department template not found' }, { status: 404 })
      }

      const { data: clonedDept, error: cloneError } = await supabase
        .from('departments')
        .insert({
          name: template.name,
          slug: template.slug,
          persona_prompt: template.persona_prompt,
          tone_override: template.tone_override,
          capabilities: template.capabilities,
          restrictions: template.restrictions,
          tools: template.tools,
          model_provider: template.model_provider,
          model_name: template.model_name,
          icon: template.icon,
          color: template.color,
          is_orchestrator: template.is_orchestrator,
          created_by: user.id,
          orc_persona_id: `direct_llm:${template.slug}`,
          activation_stage: 'active',
          status: 'idle',
        })
        .select()
        .single()
      if (cloneError) {
        const isUnique = cloneError.message?.includes('unique') || (cloneError as any).code === '23505'
        const message = isUnique
          ? 'Department templates cannot be copied until the latest departments migration (v10.2) is applied in Supabase. Conflict on orc_persona_id or slug.'
          : cloneError.message
        return NextResponse.json({ success: false, error: message }, { status: 500 })
      }

      await supabase.from('event_log').insert({
        department_id: clonedDept.id,
        department_slug: clonedDept.slug,
        event_type: 'department_created',
        description: `Department "${clonedDept.name}" created from template`,
        metadata: { template_slug: parsedTemplate.template_slug, source: 'template' },
        created_by: user.id
      })

      const responseBody = {
        success: true,
        data: clonedDept
      }
      await completeIdempotentRequest(req, supabase, user.id, responseBody, 201)

      return NextResponse.json(responseBody, { status: 201 })
    }

    const parsed = CreateSchema.parse(body)

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    // Step 1a: Slug uniqueness
    const { data: existing } = await supabase
      .from('departments')
      .select('id')
      .eq('slug', parsed.slug)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A department with slug "${parsed.slug}" already exists.`, code: 'SLUG_CONFLICT' },
        { status: 409 }
      )
    }

    // Step 1b: Tool availability (only if tools requested)
    if (parsed.tools.length > 0) {
      const { data: availableTools } = await supabase
        .from('available_tools')
        .select('id')
        .eq('is_configured', true)
      const availableIds = availableTools?.map((t: any) => t.id) ?? []
      const invalid = parsed.tools.filter((t) => !availableIds.includes(t))
      if (invalid.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `These tools are not configured: ${invalid.join(', ')}. Configure them in Settings first.`,
            code: 'TOOLS_NOT_CONFIGURED',
          },
          { status: 400 }
        )
      }
    }

    // Step 2: Insert into Supabase with activation_stage = 'draft'
    const { data: dept, error: dbError } = await supabase
      .from('departments')
      .insert({ 
        ...parsed, 
        activation_stage: 'draft', 
        status: 'idle', 
        created_by: user.id,
        orc_persona_id: `direct_llm:${parsed.slug}`
      })
      .select()
      .single()
    if (dbError) throw new Error(dbError.message)

    // Step 3: Log creation
    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'department_created',
      description: `Department "${dept.name}" created`,
      metadata: { activation_stage: 'draft' },
      created_by: user.id
    })

    const responseBody = {
      success: true,
      data: dept
    }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 201)

    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR' },
        { status: 400 }
      )
    }
    console.error('[POST /api/departments]', err)
    return NextResponse.json({ success: false, error: 'Failed to create department' }, { status: 500 })
  }
}
