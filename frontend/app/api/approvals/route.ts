// GET /api/approvals         — list pending approvals (optionally filter by status)
// POST /api/approvals        — create a new approval request (called by agent actions)

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
    const status = searchParams.get('status') || 'pending'
    const departmentSlug = searchParams.get('department')

    let query = supabase
      .from('approval_queue')
      .select('*')
      .eq('created_by', user.id)
      .order('requested_at', { ascending: false })

    if (status !== 'all') query = query.eq('status', status)
    if (departmentSlug) query = query.eq('department_slug', departmentSlug)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/approvals]', err)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}

const CreateApprovalSchema = z.object({
  department_id: z.string().uuid(),
  department_name: z.string().min(1),
  department_slug: z.string().min(1),
  action_type: z.enum([
    'send_email', 'post_social', 'send_message', 'merge_code',
    'spend_budget', 'create_document', 'run_query', 'delete_data',
    'external_api_call', 'tool_call', 'other',
  ]),
  action_label: z.string().min(1),
  payload: z.record(z.unknown()),
  context: z.string().optional(),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
})

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const parsed = CreateApprovalSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    const { data, error } = await supabase
      .from('approval_queue')
      .insert({ ...parsed, created_by: user.id })
      .select()
      .single()

    if (error) throw error

    // Set department status to awaiting_approval
    await supabase
      .from('departments')
      .update({ status: 'awaiting_approval' })
      .eq('id', parsed.department_id)
      .eq('created_by', user.id)

    // Log to event_log
    await supabase.from('event_log').insert({
      department_id: parsed.department_id,
      department_slug: parsed.department_slug,
      event_type: 'approval_requested',
      description: `Approval requested: ${parsed.action_label}`,
      metadata: { approval_id: data.id, risk_level: parsed.risk_level },
      created_by: user.id,
    })

    const responseBody = { data }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 201)

    return NextResponse.json(responseBody, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/approvals]', err)
    return NextResponse.json({ error: 'Failed to create approval' }, { status: 500 })
  }
}
