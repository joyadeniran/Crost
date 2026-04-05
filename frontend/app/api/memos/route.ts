// GET /api/memos   — list memos (filter by tag, department, priority)
// POST /api/memos  — create a new memo

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const tag = searchParams.get('tag')
    const department = searchParams.get('department')
    const priority = searchParams.get('priority')

    let query = supabase
      .from('company_memos')
      .select('*')
      .order('created_at', { ascending: false })

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
    const body = await req.json()
    const parsed = CreateMemoSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('company_memos')
      .insert(parsed)
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
      })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/memos]', err)
    return NextResponse.json({ error: 'Failed to create memo' }, { status: 500 })
  }
}
