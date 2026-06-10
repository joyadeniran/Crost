import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function checkGemini(): Promise<{ status: 'ok' | 'down'; detail?: string }> {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY ?? process.env.GEMINI_API_KEY
  const projectId = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT

  if (!apiKey && !projectId) {
    return { status: 'down', detail: 'GOOGLE_AI_STUDIO_API_KEY or GCP_PROJECT_ID not configured' }
  }

  try {
    if (projectId) {
      // On Cloud Run: Vertex AI — just confirm project env is set (actual call would require auth)
      return { status: 'ok' }
    }
    // Local dev: ping Google AI Studio models list
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(5_000) }
    )
    if (!res.ok) return { status: 'down', detail: `Gemini API returned ${res.status}` }
    return { status: 'ok' }
  } catch (err: any) {
    return { status: 'down', detail: err.message || 'Gemini unreachable' }
  }
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get('deep') === '1'

  if (!deep) {
    return NextResponse.json({ status: 'healthy', timestamp: new Date().toISOString() })
  }

  const geminiResult = await checkGemini()
  const hasDown = geminiResult.status === 'down'

  return NextResponse.json({
    status: hasDown ? 'unhealthy' : 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      gemini: geminiResult.status,
    },
    details: {
      gemini: geminiResult.detail,
    },
  }, { status: hasDown ? 503 : 200 })
}
