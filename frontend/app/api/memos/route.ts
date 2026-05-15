// GET /api/memos   — list memos (filter by tag, department, priority)
// POST /api/memos  — create a new memo

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const tag = searchParams.get('tag')
    const department = searchParams.get('department')
    const priority = searchParams.get('priority')

    let query = supabase
      .from('company_memos')
      .select('id, title, body, priority, from_department, from_department_id, tags, created_at, read_by, source_type')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (tag) query = query.contains('tags', [tag])
    if (department) query = query.eq('from_department', department)
    if (priority) query = query.eq('priority', priority)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/memos]', err)
    return NextResponse.json({ error: 'Failed to fetch memos' }, { status: 500 })
  }
}

const CreateMemoSchema = z.object({
  from_department: z.string().min(1),
  from_department_id: z.string().uuid().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
})

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = CreateMemoSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    const { data, error } = await supabase
      .from('company_memos')
      .insert({ ...parsed, created_by: user.id })
      .select()
      .single()

    if (error) throw error

    // Log memo creation
    if (parsed.from_department_id) {
      await supabase.from('event_log').insert({
        department_id: parsed.from_department_id,
        department_slug: parsed.from_department,
        event_type: 'memo_written',
        description: `Memo written: "${parsed.title}"`,
        metadata: { memo_id: data.id, tags: parsed.tags, priority: parsed.priority },
        created_by: user.id,
      })
    }

    const responseBody = { data }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 201)

    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/memos]', err)
    return NextResponse.json({ error: 'Failed to create memo' }, { status: 500 })
  }
}
