import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    // 1. Mark in user metadata — this is the per-user source of truth
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { onboarding_step: 'complete' }
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Onboarding Complete Final API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
