// PUT    /api/recurring-missions/[id] — update cadence, auto_dispatch, is_active, etc.
// DELETE /api/recurring-missions/[id] — permanently delete (or set is_active=false)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { calculateNextRun } from '@/lib/recurring-missions'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const UpdateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  founder_input: z.string().min(5).max(2000).optional(),
  cadence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  cadence_day: z.number().int().min(0).max(31).nullable().optional(),
  auto_dispatch: z.boolean().optional(),
  risk_tier_limit: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  is_active: z.boolean().optional(),
})

type Params = { params: { id: string } }

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const updates = UpdateSchema.parse(body)

    const supabase = createServerSupabaseClient()

    // Load existing mission to validate ownership and get current cadence
    const { data: existing, error: fetchErr } = await supabase
      .from('recurring_missions')
      .select('cadence, cadence_day')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !existing) {
      return NextResponse.json({ error: 'Mission not found' }, { status: 404 })
    }

    // Recompute next_run_at if cadence changed
    const effectiveCadence = updates.cadence ?? existing.cadence
    const effectiveCadenceDay = updates.cadence_day !== undefined ? updates.cadence_day : existing.cadence_day

    const patch: Record<string, unknown> = { ...updates }
    if (updates.cadence !== undefined || updates.cadence_day !== undefined) {
      patch.next_run_at = calculateNextRun(effectiveCadence, new Date(), effectiveCadenceDay).toISOString()
    }

    const { data, error } = await supabase
      .from('recurring_missions')
      .update(patch)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() },
        { status: 400 },
      )
    }
    console.error('[PUT /api/recurring-missions/[id]]', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Failed to update mission', timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('recurring_missions')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('[DELETE /api/recurring-missions/[id]]', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Failed to delete mission', timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}
