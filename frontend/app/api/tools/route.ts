// GET /api/tools — list all available tools from the registry

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const includeActions = searchParams.get('include_actions') === 'true'

    const query = supabase
      .from('available_tools')
      .select('*')
      .eq('user_id', user.id)
      .order('id')

    if (!includeActions) {
      query.eq('is_action', false)
    }

    const { data, error } = await query
    if (error) throw error
    
    return NextResponse.json({ data })
  } catch (err: any) {
    console.error('[GET /api/tools]', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch tools' }, { status: 500 })
  }
}
