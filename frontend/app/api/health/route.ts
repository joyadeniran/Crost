import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function checkGemini(): Promise<{ status: 'ok' | 'down'; detail?: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { status: 'down', detail: 'GEMINI_API_KEY not configured' }

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(5_000),
    })
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
