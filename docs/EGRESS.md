# Egress — why the old project overshot, and how this app can't

Supabase's free quota is **5 GB uncached + 5 GB cached egress / month, shared by every project in the org**. Database egress via PostgREST *and* via the pooler, Auth, Storage and Realtime all count. The previous Crost project always overshot it.

## What leaked

The old Render background worker (`crost-worker`, supabase-js) polled PostgREST ~4 req/s, and 16 zombie `executing` goals multiplied `select *` calls every 15 s cycle — a restarted, empty project was already counting. Containment applied on the Supabase project: Data API privileges revoked for `anon`/`authenticated`/`service_role` (only `waitlist` INSERT for anon). **Suspend/delete the Render services** (`crost-worker`, `crost-frontend`, `crost-approval-expiry`, `crost-litellm`) — they still hit the API with old keys.

## Design rules (enforced in code)

1. **No PostgREST, no Realtime.** The app talks to Postgres only server-side via `DATABASE_URL` (`lib/db.ts`). The browser's `.from()` is a no-op stub. The baseline revokes `service_role` table privileges so a stray client can't read tables over the Data API.
2. **No polling worker.** Work runs via `waitUntil` + a stateless supervisor cron.
3. **Metered by default.** `lib/db.ts` measures every result (bytes, rows) and labels it with the route (`withEgressLabel`). Default row cap 500 (`EGRESS_DEFAULT_ROW_LIMIT`), `single()` = `LIMIT 1`, a 5 MB single-query cap. Large queries log `[egress] {"level":"large_query",…}`.
4. **Daily budget.** `egress_ledger(day,label,bytes,calls)` is flushed from memory (batched, fail-open). `EGRESS_DAILY_BUDGET_MB` (default 100, `0` = off): ≥70% warn, ≥90% **shed polling** (429 + `Retry-After`), ≥100% **block reads** (writes — approvals, goal creation — are never blocked). `lib/egress-guard.ts`.
5. **Polling is cheap and polite.** Chat replies stream (no polling at all). Only a running mission card polls `GET /api/goals/[id]/status` (task labels + statuses, a few hundred bytes). `lib/polling.ts`: backoff 4 s→20 s while idle, pauses on hidden tabs, honors `Retry-After`, 30-min cap.
6. **Prune lists.** Layout counts in SQL (no bodies on every navigation); artifact lists use `left(body,1500)` (`lib/egress-columns.ts`); list APIs take `limit` (default 50, max 200).
7. **Cache immutable bytes.** `/api/artifacts/[id]/download` sends `ETag` + `max-age=3600` and answers `If-None-Match` with 304 without touching Storage. Storage bucket capped at 10 MB/object.
8. **Regression test.** `tests/unit/egress-static.test.ts` fails on any new `select('*')` beyond `select-star-baseline.json` (the baseline may only shrink).

## Observe

- `GET /api/usage/egress` — today's level, used/budget, top routes.
- Supabase dashboard → Usage → Egress is the source of truth (the ledger counts bytes from the app's queries, not Auth/Storage/protocol overhead — keep the budget well under quota/30).
- Tune: `EGRESS_DAILY_BUDGET_MB`, `EGRESS_DEFAULT_ROW_LIMIT`, `EGRESS_MAX_QUERY_BYTES`, `EGRESS_WARN_QUERY_BYTES`.
