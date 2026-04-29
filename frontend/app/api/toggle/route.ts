// POST /api/toggle — Cloud-only mode lock for MVP
// Body: { mode: 'local' | 'cloud' }

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Model defaults (Always cloud)
const CLOUD_DEFAULTS = { model_provider: 'groq', model_name: 'groq/llama-3.3-70b-versatile' } as const

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const supabase = createServerSupabaseClient()

    // Force Cloud Mode Logic
    await supabase
      .from('departments')
      .update(CLOUD_DEFAULTS)
      .eq('created_by', user.id)
      .neq('activation_stage', 'deprecated')

    await supabase
      .from('system_config')
      .upsert({ key: 'env_mode', value: 'cloud', created_by: user.id }, { onConflict: 'key, created_by' })

    const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
    const prodDomain = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : undefined
    const domainOptions = isProd ? { domain: prodDomain } : {}

    const res = NextResponse.json({ success: true, mode: 'cloud' })
    res.cookies.set('env_mode', 'cloud', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: false,
      sameSite: 'lax',
      ...domainOptions
    })
    return res

  } catch (err) {
    console.error('[POST /api/toggle] Forced Cloud Lock failed:', err)
    return NextResponse.json({ error: 'Failed to toggle mode' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ mode: 'cloud' })
}
