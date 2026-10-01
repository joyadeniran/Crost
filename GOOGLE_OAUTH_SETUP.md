# Google OAuth (optional) — Sign in with Google + "Connect Gmail"

Crost works without any Google OAuth client (email code sign-in + approvals). Add one only if
you want **Sign in with Google** and/or **Gmail send on approval**. Creating the OAuth client
uses the Google Cloud console, but Crost runs no Google Cloud infrastructure.

## 1. Consent screen
console.cloud.google.com → APIs & Services → OAuth consent screen: External, status *Testing*
(add your address as a test user). Scopes: `gmail.send`, `gmail.readonly`, `calendar.events`.

## 2. OAuth client (Web application) — redirect URIs
- `https://crosthq.com/api/connect/google/callback` (Connect Gmail)
- `https://www.crosthq.com/api/connect/google/callback`
- `https://<your-supabase-ref>.supabase.co/auth/v1/callback` (Sign in with Google)

## 3. Wire it up
- Vercel env: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `TOKEN_ENCRYPTION_KEY` (`openssl rand -hex 32` — stored Gmail tokens are AES-256-GCM sealed;
  connecting fails closed without it).
- Supabase → Auth → Providers → Google: paste the same client ID/secret.

## 4. Verify
Sign in → Settings → **Connect Gmail** → Google consent → back at
`/app/settings?google=connected`. An approved `send_email` action now sends from your Gmail.
