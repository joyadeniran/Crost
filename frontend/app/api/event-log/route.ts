// GET /api/event-log — list event_log rows, ownership-scoped, optional goal_id
// and event_type (comma-separated) filters.
//
// Added to give the browser a real, auth-scoped way to read event_log. Prior
// to this, WarRoom.tsx's failed-goal error-detail panel called
// `supabaseClient.from('event_log')...` directly — but lib/supabase-browser.ts's
// `.from()` is a stub left over from the Supabase→GCP migration that always
// resolves `{ data: [], error: null }`, so that panel silently never showed
// anything. This route + the corresponding WarRoom fetch() call replace it.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export async function GET(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const goalId = searchParams.get('goal_id')
    const eventTypeParam = searchParams.get('event_type')
    const limitParam = Number(searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT

    let query = supabase
      .from('event_log')
      .select('id, description, event_type, created_at, metadata, department_slug, goal_id, error_code')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })

    if (goalId) query = query.eq('goal_id', goalId)
    if (eventTypeParam) {
      const eventTypes = eventTypeParam.split(',').map((t) => t.trim()).filter(Boolean)
      if (eventTypes.length > 0) query = query.in('event_type', eventTypes)
    }

    const { data, error } = await query.limit(limit)
    if (error) throw error
    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    console.error('[GET /api/event-log]', err)
    return NextResponse.json({ error: 'Failed to fetch event log' }, { status: 500 })
  }
}
