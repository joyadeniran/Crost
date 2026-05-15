import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { id, config, is_configured } = await req.json()

    if (!id) {
      return NextResponse.json({ success: false, error: 'Tool ID is required' }, { status: 400 })
    }

    const { data: tool } = await supabase
      .from('available_tools')
      .select('user_id')
      .eq('id', id)
      .maybeSingle()

    if (!tool || (tool.user_id && tool.user_id !== user.id)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
    }

    const { error } = await supabase
      .from('available_tools')
      .update({
        config,
        is_configured,
        connector_id: is_configured ? `mcp_${id}` : null
      })
      .eq('id', id)

    if (error) {
      console.error('[Config API Error]', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
