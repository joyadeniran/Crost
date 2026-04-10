// GET /api/tools — list all available tools from the registry

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('available_tools')
      .select('*')
      .order('id')
    if (error) throw error
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/tools]', err)
    return NextResponse.json({ error: 'Failed to fetch tools' }, { status: 500 })
  }
}
