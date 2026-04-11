import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

async function checkService(name: string, checkFn: () => Promise<boolean>): Promise<{ status: 'ok' | 'down'; detail?: string }> {
  try {
    const ok = await checkFn()
    return { status: ok ? 'ok' : 'down', detail: ok ? undefined : `${name} health check failed` }
  } catch (err: any) {
    return { status: 'down', detail: err.message || `${name} unreachable` }
  }
}

async function checkSupabase(): Promise<boolean> {
  const supabase = createServerSupabaseClient()
  const { error } = await supabase.from('system_config').select('key').limit(1)
  return !error
}

async function checkLiteLLM(): Promise<boolean> {
  const url = process.env.LITELLM_URL || process.env.LITELLM_BASE_URL
  if (!url) return false // LiteLLM not configured

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    // Use /health/liveliness — no auth required, designed for uptime checks
    const res = await fetch(`${url}/health/liveliness`, { signal: controller.signal })
    clearTimeout(timeoutId)
    return res.ok
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  try {
    // Parallel health checks (LiteLLM is the unified gateway for all model providers)
    const [supabaseResult, litellmResult] = await Promise.all([
      checkService('Supabase', checkSupabase),
      checkService('LiteLLM', checkLiteLLM),
    ])

    // Determine overall status
    const allServices = [supabaseResult, litellmResult].filter(
      (s) => s.status !== undefined
    )
    const hasDown = allServices.some((s) => s.status === 'down')
    const overallStatus = hasDown ? 'unhealthy' : 'healthy'

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checkedAt: new Date().toISOString(),
      services: {
        supabase: supabaseResult.status,
        litellm: litellmResult.status,
      },
      details: {
        supabase: supabaseResult.detail,
        litellm: litellmResult.detail,
      },
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: err.message
      },
      { status: 503 }
    )
  }
}
