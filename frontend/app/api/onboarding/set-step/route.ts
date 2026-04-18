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
    const body = await req.json()
    const { step } = body

    if (!step || !['identity', 'control', 'team', 'activated', 'complete'].includes(step)) {
      return NextResponse.json({ error: 'Invalid onboarding step' }, { status: 400 })
    }

    // Update system_config (primary record)
    const { error: configErr } = await supabase
      .from('system_config')
      .upsert({
        key: 'onboarding_step',
        value: step,
        created_by: user.id
      })

    if (configErr) {
      console.error('Error updating system_config:', configErr)
    }

    // Update user metadata (secondary, more reliable across auth flows)
    const { error: metadataErr } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        onboarding_step: step
      }
    })

    if (metadataErr) {
      console.error('Error updating user metadata:', metadataErr)
      return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Onboarding Set Step API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
