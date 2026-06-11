// GET /api/connect/google/callback
// Completes the offline Google OAuth flow: validates state, exchanges the code
// for access + refresh tokens, and stores them for the founder.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { getOAuthConfig, exchangeCode } from '@/lib/google/oauth'
import { storeGoogleToken } from '@/lib/google/auth'

export const dynamic = 'force-dynamic'

function requestOrigin(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  return host ? `${proto}://${host}` : ''
}

function settingsRedirect(req: NextRequest, status: string) {
  // Stay on whichever domain the user is using.
  const base = requestOrigin(req) || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
  return NextResponse.redirect(`${base.replace(/\/$/, '')}/dashboard/settings?google=${status}`)
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) return settingsRedirect(req, 'denied')
    if (!code || !state) return settingsRedirect(req, 'error')

    const cookieState = req.cookies.get('g_oauth_state')?.value
    if (!cookieState || cookieState !== state) return settingsRedirect(req, 'state_mismatch')

    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return settingsRedirect(req, 'unauthenticated')

    const cfg = getOAuthConfig(requestOrigin(req))
    if (!cfg) return settingsRedirect(req, 'not_configured')

    const tokens = await exchangeCode(cfg, code)
    const supabase = createServerSupabaseClient()
    await storeGoogleToken(supabase, user.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      scopes: tokens.scope,
    })

    // Reflect connection on the Google toolkits the panel shows.
    for (const service of ['gmail', 'googlecalendar']) {
      await supabase.from('connections').upsert(
        { created_by: user.id, service_name: service, connection_id: 'google-oauth', updated_at: new Date().toISOString() },
        { onConflict: 'created_by, service_name' }
      )
    }

    const res = settingsRedirect(req, tokens.refresh_token ? 'connected' : 'connected_no_refresh')
    res.cookies.delete('g_oauth_state')
    return res
  } catch (err) {
    console.error('[google oauth callback]', err)
    return settingsRedirect(req, 'error')
  }
}
