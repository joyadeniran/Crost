// lib/google/oauth.ts
// Server-side Google OAuth 2.0 authorization-code flow (offline access).
// Unlike the Firebase popup (which yields only a short-lived access token), this
// flow returns a REFRESH token, enabling durable sending + background event
// listening. Server-side only.

const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URI = 'https://oauth2.googleapis.com/token'

// Scopes Crost needs to act on the founder's Google account.
export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly', // inbox context + future watch()
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
]

const PLACEHOLDER = 'REPLACE_ME'

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function getOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? ''
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (!clientId || !clientSecret || clientId === PLACEHOLDER || clientSecret === PLACEHOLDER || !appUrl) {
    return null
  }
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, '')}/api/connect/google/callback`,
  }
}

/** Build the Google consent URL. `state` is an opaque CSRF nonce. */
export function buildAuthUrl(cfg: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: GOOGLE_OAUTH_SCOPES.join(' '),
    access_type: 'offline', // request a refresh token
    prompt: 'consent', // force refresh-token issuance on re-consent
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URI}?${params.toString()}`
}

export interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope?: string
  token_type?: string
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(cfg: GoogleOAuthConfig, code: string): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}

/** Mint a fresh access token from a stored refresh token. */
export async function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string
): Promise<GoogleTokenResponse> {
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}
