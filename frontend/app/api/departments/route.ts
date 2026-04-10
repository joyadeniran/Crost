// GET /api/departments  — list all non-deprecated departments
// POST /api/departments — create a new department (6-step spec flow)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { RESERVED_SLUGS } from '@/lib/department-lifecycle'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('created_by', user.id)
      .neq('activation_stage', 'deprecated')
      .order('created_at')
    if (error) throw error
    return NextResponse.json({ data })
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

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = CreateSchema.parse(body)
    const supabase = createServerSupabaseClient()

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
      const availableIds = availableTools?.map((t) => t.id) ?? []
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
      .insert({ ...parsed, activation_stage: 'draft', status: 'idle', created_by: user.id })
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

    return NextResponse.json(
      {
        success: true,
        data: dept
      },
      { status: 201 }
    )
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
