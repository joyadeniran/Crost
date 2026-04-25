import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerComponentClient } from '@/lib/supabase'
import { executeSuggestedAction } from '@/lib/execute-suggested-action'

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

    if (!actionId) {
      return NextResponse.json(
        { success: false, error: 'action_id is required' },
        { status: 400 }
      )
    }

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

    return NextResponse.json({ success: true, result: result.result })
  } catch (err: any) {
    console.error('[POST /api/suggested-actions/execute]', err)
    return NextResponse.json(
      { success: false, error: err?.message || 'Execution failed' },
      { status: 500 }
    )
  }
}
