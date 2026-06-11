// lib/google/auth.ts
// Stores/reads the user's Google OAuth access token (captured at Google sign-in)
// in the connections table. Server-side only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const GOOGLE_SERVICE = 'google'

export async function storeGoogleToken(
  supabase: Db,
  userId: string,
  token: { access_token: string; expires_in?: number; scopes?: string }
): Promise<void> {
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString() // Google access tokens last ~1h
  await supabase.from('connections').upsert(
    {
      created_by: userId,
      service_name: GOOGLE_SERVICE,
      connection_id: 'google-oauth',
      access_token: token.access_token,
      token_expires_at: expiresAt,
      scopes: token.scopes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'created_by, service_name' }
  )
}

export interface GoogleTokenStatus {
  accessToken: string | null
  expired: boolean
  connected: boolean
}

export async function getGoogleToken(supabase: Db, userId: string): Promise<GoogleTokenStatus> {
  const { data } = await supabase
    .from('connections')
    .select('access_token, token_expires_at')
    .eq('created_by', userId)
    .eq('service_name', GOOGLE_SERVICE)
    .maybeSingle()

  if (!data?.access_token) return { accessToken: null, expired: false, connected: false }

  const expired = data.token_expires_at
    ? new Date(data.token_expires_at).getTime() < Date.now()
    : false
  return { accessToken: data.access_token, expired, connected: true }
}
