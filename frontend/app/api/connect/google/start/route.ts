// GET /api/connect/google/start
// Begins the offline Google OAuth flow (durable refresh token). Redirects the
// signed-in founder to Google's consent screen.

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerComponentClient } from '@/lib/supabase'
import { getOAuthConfig, buildAuthUrl } from '@/lib/google/oauth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const cfg = getOAuthConfig()
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
