import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/config/secret-presence
 * Returns which sensitive keys exist in system_config (true/false)
 * without ever exposing the actual value to the browser.
 */
export async function GET(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value')
      .eq('created_by', user.id)
      .ilike('key', '%_api_key%')

    if (error) throw error

    // Map existence (value !== null and !== '')
    const presence = (data ?? []).reduce((acc: Record<string, boolean>, item: any) => {
      acc[item.key] = !!(item.value && String(item.value).length > 4) // some buffer
      return acc
    }, {})

    return NextResponse.json({ presence })
  } catch (err) {
    console.error('[GET /api/config/secret-presence]', err)
    return NextResponse.json({ error: 'Failed to check key presence' }, { status: 500 })
  }
}
