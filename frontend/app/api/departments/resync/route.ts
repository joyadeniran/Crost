import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

/**
 * POST /api/departments/resync
 * Standardizes all active departments to the correct internal state.
 * Since we've moved to a Direct LLM / LiteLLM model, 'resyncing' now 
 * ensures all active departments have 'orc_persona_id' set to 'DIRECT_LLM'
 * if they are active but unsynced.
 */
export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()

    // 1. Fetch all active departments for this user
    const { data: depts, error: fetchErr } = await supabase
      .from('departments')
      .select('id, slug, orc_persona_id')
      .eq('created_by', user.id)
      .eq('activation_stage', 'active')

    if (fetchErr) throw fetchErr

    let syncedCount = 0
    const results = []

    // 2. Standardize to DIRECT_LLM state
    for (const dept of depts || []) {
      const targetId = `direct_llm:${dept.slug}`
      
      if (dept.orc_persona_id !== targetId) {
        const { error: updateErr } = await supabase
          .from('departments')
          .update({ orc_persona_id: targetId })
          .eq('id', dept.id)

        if (!updateErr) {
          syncedCount++
          results.push({ slug: dept.slug, status: 'synced', mode: 'direct_llm' })
        } else {
          results.push({ slug: dept.slug, status: 'failed', error: updateErr.message })
        }
      } else {
        results.push({ slug: dept.slug, status: 'ok', mode: 'direct_llm' })
      }
    }

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      total_active: depts?.length || 0,
      results
    })
  } catch (err: any) {
    console.error('[POST /api/departments/resync] Error:', err)
    return NextResponse.json({ error: err.message || 'Resync failed' }, { status: 500 })
  }
}
