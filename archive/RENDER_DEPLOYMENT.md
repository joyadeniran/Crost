# Render Deployment Guide

**Status:** Ready to deploy  
**Date:** April 10, 2026

---

## Prerequisites

- [ ] Supabase project created
- [ ] LiteLLM Proxy running (self-hosted or managed service)
- [ ] Git repository pushed to GitHub
- [ ] Render account created

---

## Environment Variables

Set these in Render dashboard for **both** Frontend & Worker services:

| Variable | Required | Example |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | `eyJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | `eyJhbGc...` (secret) |
| `LITELLM_BASE_URL` | ✅ | `https://litellm.xxx.com` or `http://localhost:4000` |
| `LITELLM_MASTER_KEY` | ✅ | Your LiteLLM API key |
| `NODE_ENV` | ✅ | `production` |

---

## Deployment Steps

### 1. Frontend Service (Web)

1. Go to **Render Dashboard** → **New** → **Web Service**
2. Connect GitHub repo (`crost`)
3. **Settings:**
   - **Name:** `crost-frontend`
   - **Environment:** Node
   - **Build Command:** `cd frontend && npm ci && npm run build`
   - **Start Command:** `cd frontend && npm start`
   - **Branch:** `main`
   - **Root Directory:** (leave empty)
4. Add environment variables (from table above)
5. **Create Web Service**

### 2. Worker Service (Background)

1. **New** → **Background Worker**
2. Same repo, same branch
3. **Settings:**
   - **Name:** `crost-worker`
   - **Build Command:** `cd frontend && npm ci && npm run build`
   - **Start Command:** `npx tsx scripts/worker.ts`
4. Add same environment variables
5. **Create Background Worker**

### 3. Database Migrations

After services are deployed:

```bash
# SSH into Render environment (or run via Supabase CLI locally)
supabase db push

# OR manually in Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Run: supabase/migrations/20260410050000_user_model_config.sql
```

---

## Health Checks

Frontend service includes `/api/health` endpoint for liveness checks.  
Render will automatically restart service if health check fails.

---

## Post-Deployment Verification

- [ ] Frontend loads at `https://crost-xxx.onrender.com`
- [ ] `/api/health` returns 200 + `{"status": "healthy"}`
- [ ] Dashboard accessible (may need login)
- [ ] Settings → Models page loads
- [ ] Worker is running (check logs)

---

## Scaling

- **Frontend:** Increase instance count if needed (default 1)
- **Worker:** Keep as single instance (Realtime subscriptions not parallelizable)
- **Database:** Scale Supabase compute in Supabase Dashboard

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Build failed" | Check logs: likely missing `tsx` dependency or env var |
| Health check failing | Verify Supabase credentials in env vars |
| Worker not running | Check Background Worker logs for errors |
| Models not saving | Check RLS policies applied in Supabase |

---

## Monitoring

- **Render Logs:** Real-time logs for both services
- **Supabase Logs:** SQL queries + connection errors
- **LiteLLM:** Check LiteLLM service logs if model calls fail

---

## Rollback

If deployment fails:
1. Render → Service → Deployments
2. Select previous deployment
3. Click **Redeploy**

Or revert Git commit and re-push.
