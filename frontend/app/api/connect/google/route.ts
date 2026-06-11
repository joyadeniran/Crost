// POST /api/connect/google
// Stores the Google OAuth access token captured client-side at Google sign-in
// (gmail.send / calendar scopes) so the approval executor can call Google APIs
// natively. No third-party broker.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { storeGoogleToken } from '@/lib/google/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const accessToken: string | undefined = body?.access_token
    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json({ error: 'access_token is required' }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    await storeGoogleToken(supabase, user.id, {
      access_token: accessToken,
      expires_in: typeof body?.expires_in === 'number' ? body.expires_in : undefined,
      scopes: typeof body?.scopes === 'string' ? body.scopes : undefined,
    })

    // Mark Gmail/Calendar as connected for this user.
    for (const service of ['gmail', 'googlecalendar']) {
      await supabase.from('connections').upsert(
        {
          created_by: user.id,
          service_name: service,
          connection_id: 'google-oauth',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'created_by, service_name' }
      )
    }

    return NextResponse.json({ connected: true, provider: 'google' })
  } catch (err) {
    console.error('[POST /api/connect/google]', err)
    return NextResponse.json({ error: 'Failed to store Google connection' }, { status: 500 })
  }
}
