// PATCH /api/goals/[id]/tasks/[taskId]
// Allows founder to manually set a task status:
//   'rejected' = skip (unblocks chain)
//   'completed' = mark done override (forces completion for stuck tasks)

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string; taskId: string } }

const PatchTaskSchema = z.object({
  status: z.enum(['rejected', 'completed', 'skipped']),
})

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const body = await req.json()
    const { status } = PatchTaskSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Verify the goal belongs to this user
    const { data: goal } = await supabase
      .from('goals')
      .select('id, created_by')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (!goal) {
      return NextResponse.json({ error: 'Goal not found or access denied' }, { status: 404 })
    }

    const { error } = await supabase
      .from('goal_tasks')
      .update({ status, completed_at: new Date().toISOString() })
      .eq('goal_id', params.id)
      .eq('task_id', params.taskId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Trigger chain reaction so downstream tasks can proceed (Option D)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/goals/${params.id}/dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-crost-internal-secret': process.env.WORKER_INTERNAL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
      },
      body: JSON.stringify({ task_id: 'CHAIN_REACTION' })
    }).catch(e => console.error('[Task Patch] Chain reaction failed:', e))

    await supabase.from('event_log').insert({
      goal_id: params.id,
      event_type: status === 'completed' ? 'task_force_completed' : 'task_skipped',
      description: status === 'completed'
        ? `Task ${params.taskId} manually marked done by founder`
        : `Task ${params.taskId} skipped by founder`,
      metadata: { task_id: params.taskId, goal_id: params.id },
      created_by: user.id,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('[PATCH /api/goals/[id]/tasks/[taskId]]', err)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}
