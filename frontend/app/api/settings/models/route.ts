import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [keysData, assignmentsData] = await Promise.all([
      supabase
        .from('user_api_keys')
        .select('provider, is_valid, last_validated_at')
        .eq('created_by', user.id),
      supabase
        .from('user_model_assignments')
        .select('role, model_name, provider, preset_config')
        .eq('created_by', user.id)
    ])

    return NextResponse.json({
      keys: keysData.data || [],
      assignments: assignmentsData.data || []
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { role, model_name, provider, preset_config } = await req.json()

    if (!role || !model_name || !provider) {
      return NextResponse.json(
        { error: 'role, model_name, provider required' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('user_model_assignments')
      .upsert(
        {
          created_by: user.id,
          role,
          model_name,
          provider,
          preset_config: preset_config || null,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'created_by,role' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
