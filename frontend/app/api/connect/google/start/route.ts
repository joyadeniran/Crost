// GET /api/connect/google/start
// Begins the offline Google OAuth flow (durable refresh token). Redirects the
// signed-in founder to Google's consent screen.

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getOAuthConfig, buildAuthUrl } from '@/lib/google/oauth'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function requestOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  return host ? `${proto}://${host}` : ''
}

export async function GET(req: NextRequest) {
  const guardResult = await requireUser(req)
  if (!guardResult.ok) return guardResult.response
  const user = { id: guardResult.userId }

  const cfg = getOAuthConfig(requestOrigin(req))
  if (!cfg) {
    return NextResponse.json(
      { error: 'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.' },
      { status: 503 }
    )
  }

  const state = randomBytes(16).toString('hex')
  const url = buildAuthUrl(cfg, state)

  const res = NextResponse.redirect(url)
  res.cookies.set('g_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 minutes
  })
  return res
}
