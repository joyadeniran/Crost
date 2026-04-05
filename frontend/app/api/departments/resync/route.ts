// POST /api/departments/resync
// Re-syncs all active departments that have onyx_persona_id = null or 'SYNC_FAILED'.
// Tries Onyx first; falls back to DIRECT_LLM if Onyx is unavailable.
// Safe to call at any time — only touches departments that need syncing.

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { onyxClient } from '@/lib/onyx-client'
import type { Department } from '@/types'

export async function POST() {
  try {
    const supabase = createServerSupabaseClient()

    // Find all active departments with missing or invalid Onyx sync.
    // Catches: null, 'SYNC_FAILED', 'DIRECT_LLM' (old shared value), and any
    // other value that isn't the correct per-department direct_llm:<slug> pattern.
    const { data: allActive, error } = await supabase
      .from('departments')
      .select('*')
      .eq('activation_stage', 'active')

    if (error) throw error

    const depts = (allActive ?? []).filter((d: Department) => {
      const id = d.onyx_persona_id
      // Valid if it starts with 'direct_llm:<slug>' for this department, or is a real Onyx UUID
      if (!id) return true                              // null — needs sync
      if (id === 'SYNC_FAILED') return true             // explicit failure
      if (id === 'DIRECT_LLM') return true              // old shared value — not unique
      if (id.startsWith('direct_llm:') && id !== `direct_llm:${d.slug}`) return true // wrong slug
      return false
    })

    if (!depts || depts.length === 0) {
      return NextResponse.json({ synced: 0, results: [], message: 'All departments already synced.' })
    }

    const results: { slug: string; mode: string; error?: string }[] = []

    for (const dept of depts as Department[]) {
      let personaId = 'DIRECT_LLM'
      let mode = 'direct_llm'

      try {
        const persona = await onyxClient.createPersona(dept)
        personaId = persona.id
        mode = 'onyx'
      } catch {
        // Onyx unavailable — use per-department unique placeholder
        personaId = `direct_llm:${dept.slug}`
      }

      const { error: updateErr } = await supabase
        .from('departments')
        .update({ onyx_persona_id: personaId })
        .eq('id', dept.id)

      if (updateErr) {
        results.push({ slug: dept.slug, mode: 'error', error: updateErr.message })
        continue
      }

      await supabase.from('event_log').insert({
        department_id: dept.id,
        department_slug: dept.slug,
        event_type: 'department_updated',
        description: `Department "${dept.name}" re-synced in ${mode === 'onyx' ? 'Onyx' : 'Direct LLM'} mode`,
        metadata: { mode, persona_id: personaId },
      })

      results.push({ slug: dept.slug, mode })
    }

    return NextResponse.json({
      synced: results.length,
      results,
      message: `Synced ${results.length} department${results.length === 1 ? '' : 's'}`,
    })
  } catch (err) {
    console.error('[POST /api/departments/resync]', err)
    return NextResponse.json({ error: 'Resync failed' }, { status: 500 })
  }
}
