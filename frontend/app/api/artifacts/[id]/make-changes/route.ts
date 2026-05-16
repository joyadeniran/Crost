// POST /api/artifacts/[id]/make-changes
//
// Implements the "Make Changes" workflow per Spec §9:
// When a founder taps "Make changes" on a sandbox artifact, create a new goal task
// to iterate on the same deliverable with the original department.
//
// Flow:
// 1. Load the artifact to get goal_id, department_slug, and task context
// 2. Create a new goal_task with same dept_slug, label "Revise: [title]"
// 3. Set status=draft so it's visible in the founder's dashboard
// 4. Track parent relationship via metadata
// 5. UI will dispatch the new task like any other goal task

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()

    // 1. Load the artifact
    const { data: artifact, error: fetchErr } = await supabase
      .from('artifacts')
      .select('id, title, goal_id, department_slug, department_id, task_id, artifact_type, body')
      .eq('id', params.id)
      .eq('created_by', user.id)
      .single()

    if (fetchErr || !artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }

    // Validate that artifact is in a revisionable state (draft, review, or active)
    const { data: fullArtifact } = await supabase
      .from('artifacts')
      .select('status')
      .eq('id', params.id)
      .single()

    if (!fullArtifact || fullArtifact.status === 'discarded') {
      return NextResponse.json({
        success: false,
        error: 'Cannot revise a discarded artifact',
        code: 'ARTIFACT_DISCARDED',
        timestamp: new Date().toISOString(),
      }, { status: 422 })
    }

    // 2. If the artifact has a goal, get the original task context
    let originalTask = null
    if (artifact.goal_id && artifact.task_id) {
      const { data: taskData } = await supabase
        .from('goal_tasks')
        .select('action, label, reasoning, params, expected_deliverable')
        .eq('goal_id', artifact.goal_id)
        .eq('task_id', artifact.task_id)
        .single()
      originalTask = taskData
    }

    // 3. Create a new goal_task with same context, prefixed label
    const newTaskId = crypto.getRandomUUID()
    const newLabel = `Revise: ${artifact.title}`
    const newReasoning = originalTask?.reasoning ?? 'Founder requested revisions'

    const { data: newTask, error: insertErr } = await supabase
      .from('goal_tasks')
      .insert({
        goal_id: artifact.goal_id,
        task_id: newTaskId,
        dept_slug: artifact.department_slug,
        action: originalTask?.action ?? 'create_artifact',
        label: newLabel,
        reasoning: newReasoning,
        params: {
          ...((originalTask?.params as Record<string, unknown>) ?? {}),
          // Add parent artifact reference to context
          revising_artifact_id: artifact.id,
          previous_artifact_type: artifact.artifact_type,
        },
        risk_level: originalTask?.risk_level ?? 'low',
        depends_on: [],
        expected_deliverable: originalTask?.expected_deliverable ?? `Revised ${artifact.artifact_type}`,
        model: originalTask?.model ?? 'claude',
        status: 'pending',
      })
      .select('*')
      .single()

    if (insertErr) {
      console.error('[POST /api/artifacts/[id]/make-changes] Insert failed:', insertErr)
      return NextResponse.json({
        success: false,
        error: 'Failed to create revision task',
        timestamp: new Date().toISOString(),
      }, { status: 500 })
    }

    // 4. Create a suggested action to dispatch the new task
    const { data: suggestedAction, error: actionErr } = await supabase
      .from('suggested_actions')
      .insert({
        source_entity_type: 'artifact',
        source_entity_id: artifact.id,
        action_slug: 'dispatch_task',
        label: `Dispatch revision task`,
        reasoning: `Founder requested revisions to "${artifact.title}"`,
        payload: {
          goal_id: artifact.goal_id,
          task_id: newTaskId,
          parent_artifact_id: artifact.id,
        },
        required_tool: null,
        required_inputs: [],
        risk_level: 'low',
        execution_path: 'internal',
        target_department: artifact.department_slug,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (actionErr) {
      console.error('[POST /api/artifacts/[id]/make-changes] Action insert failed:', actionErr)
      // Continue anyway — task was created successfully
    }

    // 5. Log event
    await supabase.from('event_log').insert({
      department_slug: artifact.department_slug,
      goal_id: artifact.goal_id,
      event_type: 'artifact_revision_requested',
      description: `Founder requested revisions to artifact: "${artifact.title}"`,
      metadata: {
        artifact_id: artifact.id,
        new_task_id: newTaskId,
        suggested_action_id: suggestedAction?.id,
      },
      created_by: user.id,
    })

    return NextResponse.json({
      success: true,
      data: {
        artifact_id: artifact.id,
        new_task_id: newTaskId,
        goal_id: artifact.goal_id,
        suggested_action_id: suggestedAction?.id,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    console.error('[POST /api/artifacts/[id]/make-changes]', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to create revision', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
