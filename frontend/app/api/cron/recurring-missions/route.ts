// POST /api/cron/recurring-missions
//
// Cron handler that fires due recurring missions.
// Called on a schedule (e.g. every 15 minutes) by an external cron service.
// Authenticated via the same x-cron-secret header used by /api/approvals/expire.
//
// Flow per due mission:
// 1. Create a new goal row (status = pending → planning)
// 2. Run the orchestrator (runOrchestratorTask)
// 3. If auto_dispatch is eligible, dispatch all pending tasks via internal dispatch
// 4. Update next_run_at, last_run_at, last_goal_id, run_count

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { runOrchestratorTask } from '@/lib/llm-client'
import { calculateNextRun, checkAutoDispatchEligibility } from '@/lib/recurring-missions'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — orchestrator calls can take time

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  const provided = req.headers.get('x-cron-secret')
  if (provided !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()
  const now = new Date().toISOString()

  // Find all active missions whose next_run_at has passed
  const { data: dueMissions, error: fetchErr } = await supabase
    .from('recurring_missions')
    .select('*')
    .eq('is_active', true)
    .lte('next_run_at', now)

  if (fetchErr) {
    console.error('[cron/recurring-missions] Failed to fetch due missions:', fetchErr)
    return NextResponse.json({ error: 'Failed to fetch due missions' }, { status: 500 })
  }

  if (!dueMissions || dueMissions.length === 0) {
    return NextResponse.json({ success: true, fired: 0, timestamp: now })
  }

  const results: Array<{ mission_id: string; goal_id?: string; auto_dispatched: boolean; error?: string }> = []

  for (const mission of dueMissions) {
    try {
      // Derive short title (60 chars max)
      const title = mission.founder_input.length > 60
        ? mission.founder_input.slice(0, 57) + '…'
        : mission.founder_input

      // 1. Create goal row
      const { data: goal, error: goalErr } = await supabase
        .from('goals')
        .insert({
          title,
          founder_input: mission.founder_input,
          status: 'pending',
          created_by: mission.user_id,
        })
        .select('id')
        .single()

      if (goalErr || !goal) {
        results.push({ mission_id: mission.id, auto_dispatched: false, error: goalErr?.message ?? 'goal insert failed' })
        continue
      }

      // 2. Set status to planning
      await supabase.from('goals').update({ status: 'planning' }).eq('id', goal.id)

      // 3. Run orchestrator — waits for completion
      await runOrchestratorTask(mission.founder_input, goal.id)

      // 4. Reload goal to get orc_decision
      const { data: updatedGoal } = await supabase
        .from('goals')
        .select('orc_decision, orchestrator_plan')
        .eq('id', goal.id)
        .single()

      let autoDispatched = false
      if (updatedGoal?.orc_decision && mission.auto_dispatch) {
        const orcDecision = updatedGoal.orc_decision as {
          mode: string
          risk_notes: string[]
          risk_tier?: number
        }

        const eligible = checkAutoDispatchEligibility(mission, orcDecision)
        if (eligible) {
          // Get all pending goal_tasks and dispatch each one
          const { data: pendingTasks } = await supabase
            .from('goal_tasks')
            .select('task_id')
            .eq('goal_id', goal.id)
            .eq('status', 'pending')

          if (pendingTasks && pendingTasks.length > 0) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL
            const internalSecret = process.env.WORKER_INTERNAL_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY

            for (const task of pendingTasks) {
              await fetch(`${appUrl}/api/goals/${goal.id}/dispatch`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-crost-internal-secret': internalSecret ?? '',
                },
                body: JSON.stringify({ task_id: task.task_id }),
              }).catch(e => console.error(`[cron/recurring-missions] dispatch failed for task ${task.task_id}:`, e))
            }
            autoDispatched = true
          }
        }
      }

      // 5. Update mission state
      const nextRunAt = calculateNextRun(mission.cadence, new Date(), mission.cadence_day)
      await supabase
        .from('recurring_missions')
        .update({
          last_run_at: now,
          last_goal_id: goal.id,
          next_run_at: nextRunAt.toISOString(),
          run_count: (mission.run_count ?? 0) + 1,
        })
        .eq('id', mission.id)

      results.push({ mission_id: mission.id, goal_id: goal.id, auto_dispatched: autoDispatched })
    } catch (err: any) {
      console.error(`[cron/recurring-missions] Mission ${mission.id} failed:`, err)
      results.push({ mission_id: mission.id, auto_dispatched: false, error: err?.message ?? 'unknown error' })
    }
  }

  return NextResponse.json({
    success: true,
    fired: results.length,
    results,
    timestamp: now,
  })
}
