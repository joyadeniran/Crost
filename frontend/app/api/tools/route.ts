// GET /api/tools — list all available tools from the registry

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

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
