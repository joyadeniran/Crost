// PATCH /api/approvals/[id] — approve or reject an approval request

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'

interface Params { params: { id: string } }

const DecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decided_by: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const body = await req.json()
    const { decision, decided_by } = DecisionSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Fetch the approval to validate it's pending
    const { data: approval, error: fetchErr } = await supabase
      .from('approval_queue')
      .select('*')
      .eq('id', params.id)
      .single()

    if (fetchErr || !approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot decide on approval with status "${approval.status}"` },
        { status: 409 }
      )
    }

    // Update approval status
    const { data: updated, error: updateErr } = await supabase
      .from('approval_queue')
      .update({ status: decision, decided_at: new Date().toISOString(), decided_by })
      .eq('id', params.id)
      .select()
      .single()

    if (updateErr) throw updateErr

    // Reset department status to idle
    await supabase
      .from('departments')
      .update({ status: 'idle' })
      .eq('id', approval.department_id)

    // Log decision
    await supabase.from('event_log').insert({
      department_id: approval.department_id,
      department_slug: approval.department_slug,
      event_type: decision === 'approved' ? 'approval_approved' : 'approval_rejected',
      description: `Approval ${decision}: ${approval.action_label}`,
      metadata: { approval_id: params.id, decided_by },
    })

    return NextResponse.json({ data: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: err.errors }, { status: 400 })
    }
    console.error('[PATCH /api/approvals/:id]', err)
    return NextResponse.json({ error: 'Failed to update approval' }, { status: 500 })
  }
}
