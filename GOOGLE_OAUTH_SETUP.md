# Google OAuth (offline) — activation runbook

The offline Google connection (durable refresh tokens for sending + event
listening) is fully implemented. It needs a real OAuth **Web** client. ~10 min,
all in the `crost-hq` project. Until done, "Connect Google" returns
*"not configured"*; the short-lived popup token from login still works.

## 1. OAuth consent screen
console.cloud.google.com → **APIs & Services → OAuth consent screen** (project `crost-hq`):
- User type: External · Publishing status: **Testing**
- **Add scopes**: `.../auth/gmail.send`, `.../auth/gmail.readonly`, `.../auth/calendar.events`
- **Add test users**: your Google address (the one you sign into Crost with)

## 2. OAuth client (Web application)
**APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**
(or reuse the existing "Web client (auto created by Google Service)").
- **Authorized redirect URIs** — add both:
  - `https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/connect/google/callback`
  - `https://app.crosthq.com/api/connect/google/callback`
- Copy the **Client ID** and **Client secret**.

## 3. Store the credentials as secrets
```bash
printf 'YOUR_CLIENT_ID'     | gcloud secrets versions add GOOGLE_OAUTH_CLIENT_ID     --data-file=- --project=crost-hq
printf 'YOUR_CLIENT_SECRET' | gcloud secrets versions add GOOGLE_OAUTH_CLIENT_SECRET --data-file=- --project=crost-hq
```

## 4. Roll a new revision (picks up :latest secret values)
```bash
gcloud run services update crost-frontend --region=us-central1 --project=crost-hq
```

## 5. Verify
Settings → MCP & Tool Connections → **Connect** on Gmail → Google consent →
back to Settings with `?google=connected`. The token now refreshes
automatically; sends work beyond the 1-hour window.

> Note: `NEXT_PUBLIC_APP_URL` (baked at build = the Cloud Run URL) determines the
> redirect URI the app sends. It must exactly match a URI registered in step 2.
