# Deploying Crost on Vercel + Supabase

One Next.js app (`frontend/`) serves the marketing site (`/`, `/pricing`, `/privacy`,
`/terms`) and the product (`/app/*`, `/login`, `/signup`, `/api/*`) from one origin.
Supabase provides Auth, Postgres and Storage. Gemini (Google AI API key) is the model.
There is no Google Cloud infrastructure.

## 1. Create the Supabase project (≈5 min)

1. supabase.com → New project. Pick a region near your users; save the database password.
2. **Apply the schema** — SQL Editor → paste
   `supabase/migrations/20261001000000_crost_beta_baseline.sql` → Run.
   (Or `supabase link --project-ref <ref> && supabase db push`.)
   It is a single baseline: tables, department templates, RLS (on, no policies), the
   private `crost` storage bucket, and the insert-only `waitlist` table.
3. **Auth → URL Configuration**
   - Site URL: `https://crosthq.com`
   - Redirect URLs: `https://crosthq.com/auth/callback` (add `http://localhost:3000/auth/callback` for dev)
4. **Auth → Providers → Email**: keep "Confirm email" ON. In **Auth → Email Templates**,
   make sure the Magic Link / Confirm signup templates include `{{ .Token }}` (the 6-digit
   code the login/signup pages ask for) as well as the link.
5. **Auth → Providers → Google** (optional, for "Sign in with Google"): paste the OAuth
   client ID/secret (see `GOOGLE_OAUTH_SETUP.md`) and add Supabase's callback
   `https://<ref>.supabase.co/auth/v1/callback` to the Google client's redirect URIs.
6. Collect from **Project Settings → API**: Project URL, `anon` key, `service_role` key.
   From **Project Settings → Database → Connection string**: the **Transaction pooler**
   URL (port 6543) — use it as `DATABASE_URL`.

## 2. Environment variables (Vercel → Project → Settings → Environment Variables)

See `frontend/.env.example`. Required for the beta loop:

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public, from Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | secret — server only |
| `DATABASE_URL` | Supabase transaction-pooler URL |
| `GEMINI_API_KEY` | https://aistudio.google.com/apikey |
| `NEXT_PUBLIC_APP_URL` | `https://crosthq.com` |
| `WORKER_INTERNAL_SECRET` | `openssl rand -hex 32` |
| `CRON_SECRET` | `openssl rand -hex 32` — Vercel Cron sends it as a Bearer token; cron routes return 500 without it |

Optional: `TOKEN_ENCRYPTION_KEY` (+ `GOOGLE_OAUTH_CLIENT_ID/SECRET`) to enable "Connect Gmail";
`BREVO_API_KEY`/`BREVO_LIST_ID` for waitlist email; `NEXT_PUBLIC_POSTHOG_KEY`/`_HOST`.

## 3. Project settings

- Framework: Next.js · **Root Directory: `frontend`** · Node 20+.
- Domain: add `crosthq.com` (+ `www`) to the project, then point DNS at Vercel.
  `app.crosthq.com` can be removed or 301-redirected to `https://crosthq.com/app`
  (the app also redirects the old `/dashboard` and `/onboarding` paths into `/app`).
- Function duration: LLM routes set `maxDuration = 300`; this needs Fluid Compute (default on
  new projects) or a Pro plan. On a plan capped at 60s, planning/worker calls can time out.

## 4. Crons (`frontend/vercel.json`)

Daily, so the config deploys on every plan: `/api/cron/supervise` (safety-net pass),
`/api/approvals/expire`, `/api/suggested-actions/expire`. Normal progress is event-driven
(dispatch → worker → chain reaction via `waitUntil`); the cron only rescues stalled work.
On Pro, change supervise to `*/5 * * * *` for faster recovery.

## 5. Smoke test

1. `https://crosthq.com/` → bridge animation scrolls; "Try the beta" → `/signup`.
2. Sign up → 6-digit code → onboarding (identity → Orc → activate) → `/app`.
3. Submit a goal → Orc plans 3–5 tasks → approve → departments produce artifacts/memos.
4. An external action (email) appears in **Approvals**; nothing sends until you approve.
5. `GET /api/health?deep=1` → Gemini reachable.

## Tests

```bash
cd frontend
npm run type-check && npm run test:unit
# real-Postgres integration test (applies the baseline migration to a scratch DB):
createdb crost_test && TEST_DATABASE_URL=postgres://localhost/crost_test npm run test:integration
```
