// POST /api/departments/[slug]/reset — force-reset a stuck department
// Clears 'running' status back to 'idle', logs the event

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

interface Params { params: { slug: string } }

export async function POST(_req: NextRequest, { params }: Params) {
  try {
    const supabase = createServerSupabaseClient()

    const { data: dept } = await supabase
      .from('departments')
      .select('id, name, slug, status, last_active_at')
      .eq('slug', params.slug)
      .single()

    if (!dept) return NextResponse.json({ error: 'Department not found' }, { status: 404 })

    if (dept.status !== 'running') {
      return NextResponse.json(
        { error: `Department is not running (current status: ${dept.status})` },
        { status: 400 }
      )
    }

    // Check it's actually stuck (> 30 min)
    const lastActive = dept.last_active_at ? new Date(dept.last_active_at).getTime() : 0
    const stuckMs = Date.now() - lastActive
    if (stuckMs < 30 * 60 * 1000) {
      return NextResponse.json(
        { error: `Department has only been running for ${Math.round(stuckMs / 60000)} min — wait at least 30 min before force-resetting` },
        { status: 400 }
      )
    }

    await supabase
      .from('departments')
      .update({ status: 'idle', current_task: null })
      .eq('id', dept.id)

    await supabase.from('event_log').insert({
      department_id: dept.id,
      department_slug: dept.slug,
      event_type: 'error',
      description: `Department "${dept.name}" force-reset by founder after being stuck running for ${Math.round(stuckMs / 60000)} min`,
      metadata: { previous_status: 'running', reset_by: 'founder', stuck_minutes: Math.round(stuckMs / 60000) },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[POST /api/departments/:slug/reset]', err)
    return NextResponse.json({ error: 'Failed to reset department' }, { status: 500 })
  }
}
