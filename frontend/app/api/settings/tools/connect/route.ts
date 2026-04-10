import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const { service_name, connection_id } = await req.json()

    if (!service_name || !connection_id) {
      return NextResponse.json({ success: false, error: 'Missing service_name or connection_id' }, { status: 400 })
    }

    // 2. Save to connections table
    const { error: connError } = await supabase
      .from('connections')
      .upsert({
        created_by: user.id,
        service_name,
        connection_id,
        created_at: new Date().toISOString()
      }, { onConflict: 'created_by, service_name' })

    if (connError) {
      console.error('[Connect API] connections table error:', connError)
      return NextResponse.json({ success: false, error: connError.message }, { status: 500 })
    }

    // 3. Mark in available_tools (optional, but good for UI sync if global)
    await supabase
      .from('available_tools')
      .update({ is_configured: true })
      .eq('id', service_name)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Connect API Error]', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Connection failed' },
      { status: 500 }
    )
  }
}
