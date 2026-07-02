import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { runOrchestratorTask } from '@/lib/llm-client'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Authenticate via cookie-aware SSR client
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    // Service role for privileged DB access
    const supabase = createServerSupabaseClient()

    const { goal } = await req.json()

    // Derive a short title (same pattern as /api/goals)
    const title = goal.length > 60 ? goal.slice(0, 57) + '…' : goal

    // 1. Create a Goal Row first to get an ID
    const { data: goalRow, error: goalErr } = await supabase
      .from('goals')
      .insert({
        title,
        founder_input: goal,
        status: 'planning',
        created_by: user.id
      })
      .select()
      .single()

    if (goalErr || !goalRow) throw goalErr

    // 2. Always mark onboarding complete once a goal row is created.
    //    Do this BEFORE calling the orchestrator so the user can reach the
    //    dashboard even if the LLM call fails or times out.
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { onboarding_step: 'complete' }
    })
    await supabase.from('system_config').upsert({
      key: 'onboarding_complete',
      value: true,
      created_by: user.id
    })

    // 3. Priming Orc for Onboarding
    // We'll append the onboarding context to the user input for this specific call.
    const onboardingGoal = `
    ${goal}

    ONBOARDING CONTEXT:
    This is the founder's first goal. No external tools are connected yet.
    Produce a plan that consists entirely of:
    - Draft tasks (writing, planning, research)
    - Analysis tasks (summarising, prioritising)
    Do not assign any tasks that require Gmail, GitHub, or external APIs.
    The founder will connect tools as they need them.
    `

    const res = await runOrchestratorTask(onboardingGoal, goalRow.id)
    // Tasks are already in goal_tasks (inserted by runOrchestratorTask).
    // Goal is in status 'awaiting_approval' with orchestrator_plan set.
    // The War Room will pick this up via the pending goal ID stored in localStorage.

    return NextResponse.json({ goal_id: goalRow.id, plan: res.plan })
  } catch (err: any) {
    console.error('[First Goal API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
