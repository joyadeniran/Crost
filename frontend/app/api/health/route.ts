import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Render's healthCheckPath only needs a 200 to confirm the process is alive.
// We intentionally do NOT query Supabase here — Render pings this every ~5s,
// which was generating 17,280 DB queries/day and exhausting free-tier egress.
//
// For a real dependency check, call GET /api/health?deep=1 from monitoring tools
// (not from Render's health check config).

async function checkLiteLLM(): Promise<{ status: 'ok' | 'down'; detail?: string }> {
  const url = process.env.LITELLM_URL || process.env.LITELLM_BASE_URL
  if (!url) return { status: 'down', detail: 'LITELLM_BASE_URL not configured' }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${url}/health/liveliness`, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (!res.ok) return { status: 'down', detail: `LiteLLM returned ${res.status}` }
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('text/html')) return { status: 'down', detail: 'LiteLLM returned HTML (service suspended?)' }
    return { status: 'ok' }
  } catch (err: any) {
    return { status: 'down', detail: err.message || 'LiteLLM unreachable' }
  }
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1'

  if (!deep) {
    // Shallow check — process liveness only. No DB, no outbound calls.
    // This is what Render's healthCheckPath hits every ~5s.
    return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() })
  }

  // Deep check — only run when explicitly requested (e.g. from monitoring dashboards).
  const litellmResult = await checkLiteLLM()
  const hasDown = litellmResult.status === 'down'

  return NextResponse.json({
    status: hasDown ? 'unhealthy' : 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      litellm: litellmResult.status,
    },
    details: {
      litellm: litellmResult.detail,
    },
  }, { status: hasDown ? 503 : 200 })
}
