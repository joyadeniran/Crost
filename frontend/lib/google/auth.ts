// lib/google/auth.ts
// Stores/reads the user's Google OAuth tokens in the connections table and
// transparently refreshes an expired access token using the stored refresh
// token (offline flow). Server-side only.

import { getOAuthConfig, refreshAccessToken } from './oauth'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const GOOGLE_SERVICE = 'google'

export async function storeGoogleToken(
  supabase: Db,
  userId: string,
  token: { access_token: string; refresh_token?: string; expires_in?: number; scopes?: string }
): Promise<void> {
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString() // Google access tokens last ~1h
  const row: Record<string, unknown> = {
    created_by: userId,
    service_name: GOOGLE_SERVICE,
    connection_id: 'google-oauth',
    access_token: token.access_token,
    token_expires_at: expiresAt,
    scopes: token.scopes ?? null,
    updated_at: new Date().toISOString(),
  }
  // Only overwrite the refresh token when Google returns a new one — refresh
  // grants frequently omit it, and we must not clobber the stored value.
  if (token.refresh_token) row.refresh_token = token.refresh_token
  await supabase.from('connections').upsert(row, { onConflict: 'created_by, service_name' })
}

export interface GoogleTokenStatus {
  accessToken: string | null
  expired: boolean
  connected: boolean
  /** True if a refresh token is stored (durable, offline-capable connection). */
  durable: boolean
}

/**
 * Returns a VALID Google access token for the user, transparently refreshing via
 * the stored refresh token when the current one is expired. `expired` is only
 * true when there is no usable token (no refresh token, or refresh failed).
 */
export async function getGoogleToken(supabase: Db, userId: string): Promise<GoogleTokenStatus> {
  const { data } = await supabase
    .from('connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('created_by', userId)
    .eq('service_name', GOOGLE_SERVICE)
    .maybeSingle()

  if (!data?.access_token && !data?.refresh_token) {
    return { accessToken: null, expired: false, connected: false, durable: false }
  }

  const durable = !!data?.refresh_token
  const isExpired = data?.token_expires_at
    ? new Date(data.token_expires_at).getTime() < Date.now() - 60_000 // 60s skew
    : false

  if (data?.access_token && !isExpired) {
    return { accessToken: data.access_token, expired: false, connected: true, durable }
  }

  // Access token missing/expired — refresh if we can.
  if (data?.refresh_token) {
    const cfg = getOAuthConfig()
    if (cfg) {
      try {
        const fresh = await refreshAccessToken(cfg, data.refresh_token)
        await storeGoogleToken(supabase, userId, {
          access_token: fresh.access_token,
          refresh_token: fresh.refresh_token, // usually undefined; storeGoogleToken won't clobber
          expires_in: fresh.expires_in,
          scopes: fresh.scope,
        })
        return { accessToken: fresh.access_token, expired: false, connected: true, durable: true }
      } catch (err) {
        console.error('[getGoogleToken] refresh failed:', (err as Error).message)
        // fall through — surface as expired so the caller asks the user to reconnect
      }
    }
  }

  return { accessToken: data?.access_token ?? null, expired: true, connected: true, durable }
}
