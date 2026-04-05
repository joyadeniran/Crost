// POST /api/toggle — switch between local and cloud mode
// Body: { mode: 'local' | 'cloud' }
//
// Strategy:
//  1. Set an env_mode cookie — instant, reliable, no DB dependency
//  2. Upsert env_mode in system_config — for persistence across devices
//  3. Single bulk UPDATE for all departments — 1 DB call, not N

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { z } from 'zod'

const ToggleSchema = z.object({
  mode: z.enum(['local', 'cloud']),
})

// Model defaults per mode
const CLOUD_DEFAULTS = { model_provider: 'groq', model_name: 'cloud/groq-llama' } as const
const LOCAL_DEFAULTS  = { model_provider: 'local', model_name: 'local/gemma3' }   as const

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { mode } = ToggleSchema.parse(body)
    const supabase = createServerSupabaseClient()

    // Single bulk update — all non-deprecated departments at once
    const modelUpdate = mode === 'cloud' ? CLOUD_DEFAULTS : LOCAL_DEFAULTS
    await supabase
      .from('departments')
      .update(modelUpdate)
      .neq('activation_stage', 'deprecated')

    // Upsert env_mode — only key + value, no updated_at (column may not exist)
    await supabase
      .from('system_config')
      .upsert({ key: 'env_mode', value: mode }, { onConflict: 'key' })

    // Log (best-effort — don't let this failure break the response)
    void supabase.from('event_log').insert({
      event_type: 'mode_switched',
      description: `System switched to ${mode} mode`,
      metadata: { to: mode },
    })

    // Build response and set cookie — cookie is the primary source of truth
    // for the layout so navigation never reverts
    const res = NextResponse.json({ success: true, mode })
    res.cookies.set('env_mode', mode, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: false,             // readable by client JS if needed
      sameSite: 'lax',
    })
    return res

  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }
    console.error('[POST /api/toggle]', err)
    return NextResponse.json({ error: 'Failed to toggle mode' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'env_mode')
      .single()
    if (error) throw error
    return NextResponse.json({ mode: data.value })
  } catch {
    return NextResponse.json({ mode: 'local' })
  }
}
