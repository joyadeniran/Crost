import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { id, is_configured } = await req.json()

    if (!id) {
      return NextResponse.json({ success: false, error: 'Tool ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('available_tools')
      .update({ is_configured, onyx_connector_id: is_configured ? `mcp_${id}` : null })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
