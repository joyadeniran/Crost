// POST /api/goals/[id]/dialogue
// Appends a founder response to the Orc conversation and re-triggers planning.
// Also supports 'force_plan' to skip clarification.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { runOrchestratorTask } from '@/lib/llm-client'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const DialogueSchema = z.object({
  message: z.string().optional(),
  force_plan: z.boolean().optional(),
})

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json()
    const { message, force_plan } = DialogueSchema.parse(body)
    const supabase = createServerSupabaseClient()
    const goalId = params.id

    // 1. Fetch current goal state
    const { data: goal, error: fetchErr } = await supabase
      .from('goals')
      .select('founder_input, orc_conversation, status')
      .eq('id', goalId)
      .eq('created_by', user.id)
      .single()

    if (fetchErr || !goal) throw new Error('Goal not found')

    let updatedHistory = goal.orc_conversation || []

    // 2. If message provided, append to history
    if (message) {
      updatedHistory = [
        ...updatedHistory,
        { role: 'user', content: message, ts: new Date().toISOString() }
      ]
      
      // Update DB history and set status back to planning
      await supabase.from('goals').update({
        orc_conversation: updatedHistory,
        status: 'planning'
      }).eq('id', goalId)
    } else if (force_plan) {
      // If forced, just flip to planning
      await supabase.from('goals').update({ status: 'planning' }).eq('id', goalId)
    }

    // 3. Re-trigger Orchestrator
    // We run it with the current history and the force_plan flag
    runOrchestratorTask(goal.founder_input, goalId, updatedHistory, !!force_plan).catch(async (err) => {
      console.error('[POST /api/goals/dialogue] Orchestrator failed:', err)
      
      const { logEvent } = await import('@/lib/llm-client')
      const errorMessage = String(err)
      const isQuota = errorMessage.includes('SYSTEM_LIMIT_EXCEEDED')

      await logEvent({
        event_type: isQuota ? 'token_limit_hit' : 'error',
        department_slug: 'orchestrator',
        goal_id: goalId,
        description: isQuota ? 'Daily free limit reached during planning.' : `Planning failed: ${errorMessage.slice(0, 150)}`,
        error_code: isQuota ? 'SYSTEM_LIMIT_EXCEEDED' : 'PLANNING_FAILURE',
        created_by: user.id,
        metadata: { error: errorMessage }
      }).catch(() => {})

      await supabase
        .from('goals')
        .update({ status: 'failed', outcome: errorMessage })
        .eq('id', goalId)
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/goals/dialogue]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to process dialogue', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
