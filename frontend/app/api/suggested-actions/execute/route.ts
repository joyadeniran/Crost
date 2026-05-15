import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { executeSuggestedAction } from '@/lib/execute-suggested-action'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await request.json()
    const actionId = body.action_id as string
    const supabase = createServerSupabaseClient()

    if (!actionId) {
      return NextResponse.json(
        { success: false, error: 'action_id is required' },
        { status: 400 }
      )
    }

    const idempotency = await beginIdempotentRequest(request, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    const result = await executeSuggestedAction({
      actionId,
      userId: user.id,
      goalId: body.goal_id ?? null,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      )
    }

    const responseBody = { success: true, result: result.result }
    await completeIdempotentRequest(request, supabase, user.id, responseBody, 200)

    return NextResponse.json(responseBody)
  } catch (err: any) {
    console.error('[POST /api/suggested-actions/execute]', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Execution failed' },
      { status: 500 }
    )
  }
}
