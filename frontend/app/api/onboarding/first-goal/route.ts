import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { runOrchestratorTask } from '@/lib/onyx-client'

export async function POST(req: NextRequest) {
  try {
    // Authenticate via cookie-aware SSR client
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // Service role for privileged DB access
    const supabase = createServerSupabaseClient()

    const { goal } = await req.json()

    // 1. Create a Goal Row first to get an ID
    const { data: goalRow, error: goalErr } = await supabase
      .from('goals')
      .insert({
        founder_input: goal,
        status: 'planning',
        created_by: user.id
      })
      .select()
      .single()

    if (goalErr || !goalRow) throw goalErr

    // 2. Priming Orc for Onboarding
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

    if (res.plan) {
      // 3. Write each task to approval_queue with status 'pending' (Following Spec)
      // This makes them appear in the "Approvals" feed in the dashboard.
      const approvalTasks = res.plan.tasks.map(task => ({
        goal_id: goalRow.id,
        action_type: 'orchestrator_plan_task',
        action_label: task.label,
        reasoning: task.reasoning,
        payload: task,
        risk_level: task.risk_level,
        status: 'pending'
      }))

      if (approvalTasks.length > 0) {
        await supabase.from('approval_queue').insert(approvalTasks)
      }
      
      // Mark onboarding complete in system_config
      await supabase.from('system_config').upsert({
        key: 'onboarding_complete', value: true
      })

      // NEW: Update user metadata to 'complete'
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { onboarding_step: 'complete' }
      })
    }

    return NextResponse.json({ goal_id: goalRow.id, plan: res.plan })
  } catch (err: any) {
    console.error('[First Goal API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
