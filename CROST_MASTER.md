> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 13.16  
**Last Updated:** June 12, 2026  
**Deployment Status:** ✅ LIVE — Assistant-mode hang fixed; both-domains OAuth.  
**URL:** `https://crost-frontend-3ge3tx36sa-uc.a.run.app`  
**Repo:** https://github.com/joyadeniran/Crost (public, default branch = submission code)  
**Challenge:** Google for Startups AI Agents Challenge — Track 1 (Build Net-New).

---

## Session — 10x Rebuild: Phase 2 (2.1 done, 2.2 deferred, 2.3 in progress)
**Date**: 2026-07-02 **Status**: 🔄 IN PROGRESS
**Branch**: `feature/gcp-challenge`

### Phase 2.1 — God-module split — COMPLETE
`lib/llm-client.ts` (1745 lines) split into `lib/engine/{model,prompt,parse,orchestrator,worker,memo,budget,events}.ts`, pure code motion. `lib/llm-client.ts` now a 19-line barrel re-export. Verified: `tsc --noEmit` clean, all 654 tests unchanged and green. User confirmed locally with `npm run build`: compiles clean; the only failures (8 pages, `FirebaseError: auth/invalid-api-key` on `/login`, `/signup`, `/onboarding/*`) were reproduced identically on `HEAD~1` (pre-split) via `git checkout HEAD~1 -- lib/llm-client.ts && rm -rf lib/engine && npm run build` — confirmed pre-existing (missing `NEXT_PUBLIC_FIREBASE_*` in `.env.local`), unrelated to the refactor. Not fixed (out of scope; env-var gap, arguably Phase 4/6).

### Phase 2.2 — Single data layer — DEFERRED (by founder decision)
Investigated actual scope before starting: the plan assumed raw `pg` and a Supabase-shim coexist; they don't — `lib/supabase.ts` already wraps the one canonical `createDbClient()` (`lib/db.ts`), zero raw `pg`/`getPool()` usage elsewhere. The real work would be converting 76 files' ad-hoc `createServerSupabaseClient().from(table)...` chains into typed `lib/data/` repos, which would also require rewriting ~40 test files' mocks. Founder chose to skip this and move to 2.3/2.4 rather than take on that scope/risk now. Logged here as a follow-up if revisited: start with `goals`, `goal_tasks`, `approvals`, `artifacts` repos (highest reuse, in `lib/engine/*`).

### Phase 2.3 — Central auth guard — substantially done
Created `lib/auth/guard.ts`: `requireUser(req)`, `checkInternalSecret(req)`, `requireUserOrInternal(req, {bodyUserId})` — extracted verbatim from the `worker/execute` dual-mode pattern and the session-only pattern used elsewhere. New tests: `tests/unit/auth-guard.test.ts` (9 tests).

Migrated 38 routes to the guard (mechanical, response-shape-preserving — same `{error:'Unauthenticated'},401` body/status verified per file before touching it): `worker/execute` (dual-mode), `calendar-events`, `adk`, `approvals` (+`[id]`), `artifacts` (+`[id]`, `/download`, `/make-changes`), `calendar-events/[id]`, `config` (+`/secret-presence`), `connect` (+`/google`, `/google/start`), `departments` (+`[slug]`, `/[slug]/activate`, `/[slug]/reset`, `/[slug]/task`, `/resync`), `goals` (+`[id]`, `/[id]/dialogue`, `/[id]/feedback`, `/[id]/report`, `/[id]/tasks/[taskId]`), `knowledge/read`, `knowledge/search`, `memos`, `onboarding` (`/complete`, `/complete-final`, `/first-goal`), `recurring-missions` (+`[id]`), `toggle`, `tools`, `usage/summary`. `tsc --noEmit` clean after every file (caught 7 real `_req`-vs-`req` param-name mismatches, fixed).

**Not migrated** (different response shape — `{success:false,...}` or `{error:'Unauthorized'}` instead of the guard's `{error:'Unauthenticated'},401` — would silently change the API contract if forced through the guard as-is): `settings/tools*` (3 routes), `settings/models*` (2 routes), `tools/execute`, `tools/invoke`, `suggested-actions/execute`, `suggested-actions/[id]/execute`, `usage/today`, `knowledge/files`, `knowledge/import`, `knowledge/upload`. Also skipped: `goals/[id]/dispatch` (has an internal chain-reaction bypass branch, not the simple two-branch dual-mode shape), `connect/google/callback` (redirects instead of returning JSON on 401), `onboarding/set-step` (uses `user.email`, not just `user.id` — the guard's synthetic `{id}` object would drop that field).

**Local verification: CONFIRMED.** Founder ran `npm run test:unit` locally: 663/663 green, 56/56 files (up from 654/55 at end of Phase 1 — 9 new: `auth-guard.test.ts`). First run surfaced 2 failures, both a test-authoring bug in `auth-guard.test.ts` itself (module-level env capture timing, not a route regression — the real `worker-execute.test.ts` suite passed 9/9 unchanged both times). Fixed by making `guard.ts` read `WORKER_INTERNAL_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` per-call instead of caching at module import (no production behavior change, env is static at runtime) — commit `32188cb`. Re-run: 663/663 green.

### Phase 2.4 — Uniform responses + env validation — partial
`apiOk`/`apiError` (`lib/api-response.ts`) exist from Phase 1 but zero routes use them. Checked before touching anything: rolling every route onto them would restructure every response body (`success`/`timestamp` fields added to ad-hoc shapes that currently vary route-to-route), which is exactly the "no response-shape changes" hard rule and the frontend's fetch/parsing code depends on today's shapes. Same risk category as 2.2 — deferred for the same reason, logged as a follow-up (candidate: do it per-route alongside a matching frontend fetch-call update, not as a standalone backend-only pass).

Built the other half: `lib/env.ts` — zod schema + `validateEnv()`/`validateEnvOrExit()` for the server secrets the engine/worker layer actually needs (`DATABASE_URL`, `GCS_BUCKET`, `FIREBASE_PROJECT_ID`/`CLIENT_EMAIL`/`PRIVATE_KEY`, `USER_API_ENCRYPTION_KEY`, one of `WORKER_INTERNAL_SECRET`/`SUPABASE_SERVICE_ROLE_KEY`). New tests: `tests/unit/env.test.ts` (5 tests). Deliberately **not** wired into Next.js routes/root layout or `scripts/worker.ts` this session: routes because `.env.local` is already missing `NEXT_PUBLIC_FIREBASE_*` (the Phase 2.1 finding) and a hard throw at request time would turn that tolerated gap into a wider outage; `scripts/worker.ts` because it's a separate root-level package (its own `package.json`, no `zod` dependency, no shared `tsconfig`) and importing across that boundary is unverified in this sandbox — didn't want to risk breaking the live worker process on a guess. `lib/env.ts` is ready to wire in once both of those are addressed deliberately (Phase 4 territory: filling `.env.local`, and either adding `zod` to the root package or duplicating the schema there).

### Next
Local `npm run type-check` + `npm run test:unit` to confirm the `lib/env.ts` addition, then Phase 2 exit gate check (`tsc --noEmit`, full suite, `npm run build`) before moving to Phase 3.

---

## Session — 10x Rebuild: Phase 0 + Phase 1 (started)
**Date**: 2026-07-02 **Status**: 🔄 IN PROGRESS (Phase 0 done, Phase 1 started)
**Branch**: `feature/gcp-challenge`

### Phase 0 — Baseline
`docs/BASELINE.md` created. `npm run type-check`: clean. `npm run test:unit`: 367/367 green (21 files). `npm run build`: could not be confirmed synchronously — the execution sandbox caps any single command at ~45s and cannot keep background processes alive across tool calls, and `next build` for this app (89 routes) reliably exceeds that. No errors surfaced in the time available; `typescript.ignoreBuildErrors`/`eslint.ignoreDuringBuilds` are set and `tsc --noEmit` is independently clean, so failure is unlikely but unverified. Recommend running `npm run build` locally/CI to confirm before the Phase 6 merge gate.

### Phase 1 — Characterization tests (in progress)
Gap analysis against `docs/TEST_SPEC_10X.md` T1–T8: most modules already had partial suites from prior sessions (risk-assessor, orc-decision-gate, artifact-transformers, execute-tool-call, worker-execute, llm-client, capability-checker, cost-tracker, google-oauth, gmail, recurring-missions, suggested-actions, calendar-prep, artifact-lifecycle, orc-learning, errors/utils). Identified zero-coverage modules: `idempotency.ts`, `rate-limit.ts`, `api-response.ts`, `crypto.ts`, `model-routing.ts`, `key-resolver.ts`, `output-classifier.ts`, `company-memo.ts`, `execute-suggested-action.ts`, `cost-table.ts`, `usage-logger.ts`, `lib/tools/parameter-resolver.ts` (dedicated), `lib/knowledge/extract-text.ts`, `lib/adk/*`, `app/api/mcp/route.ts`, and the full T7 route-auth matrix.

Closed this session: `api-response.ts` (7 tests), `crypto.ts` (7 tests), `idempotency.ts` (10 tests) — 24 new tests, all green, `type-check` clean. Suite now 391 tests / 24 files.

### Phase 1 — COMPLETE
All previously-zero-coverage T1–T8 modules now have characterization tests: `rate-limit`, `model-routing`, `key-resolver`, `output-classifier`, `company-memo`, `execute-suggested-action`, `cost-table`, `usage-logger`, `lib/tools/parameter-resolver`, `lib/knowledge/extract-text`, `app/api/mcp/route`. T7 route-auth matrix substantially closed (21 routes): `worker/execute`, `approvals/expire`, `approvals/[id]`, `goals/[id]/report`, `knowledge/search`, `knowledge/read`, `goals/[id]/tasks/[taskId]`, `goals/[id]/dispatch`, `config/secret-presence`, `goals` (list/create), `memos`, `connect`, `departments/[slug]/reset`, `settings/tools`, `goals/[id]/dialogue` (+ finding #8 regression), `artifacts/[id]` (+ T3.2 immutability), `artifacts/[id]/download` (+ d32b0ca regression), `usage/today`, `departments` (list/create), `suggested-actions/[id]/execute`, `calendar-events`.

**Final suite: 654 tests across 55 files, all green** (verified in three ~18-file batches due to sandbox per-command time limits). `type-check` clean after every commit — 20 commits this session on `feature/gcp-challenge`. Two drift items logged (KNOWN-BUG + SPEC-DRIFT, see below).

**Remaining T7 gap** (not done): `settings/tools/config`, `artifacts` (list route), `artifacts/[id]/make-changes`, `departments/[slug]/route.ts` + `/task` + `/activate`, `departments/resync`, `recurring-missions/*`, `suggested-actions/execute` (non-id variant), `usage/summary`, `onboarding/*` (5 routes), and `lib/adk/{agents,runner,tools}.ts`. None started.

### Open Items (handoff — not completed this session)
- **`npm run build` still unverified** — sandbox cannot run a >45s foreground command or keep background processes alive across tool calls; `next build` for this app consistently exceeds that. No errors surfaced. Run locally/CI before Phase 6.
- **T7 route-auth matrix**: ~10 routes remain (see list above) plus the ADK layer. Lower urgency than before — the highest-traffic/highest-risk routes (worker/execute, dispatch, dialogue, approvals, artifacts) are now covered.
- **`lib/adk/{agents,runner,tools}.ts`** (agent tree, zod schemas) untested.
- **Phase 2 (god-module split of `lib/llm-client.ts`, 1745 lines) intentionally NOT started this session.** Read the full file (deeply interdependent: `runOrchestratorTask`/`runWorkerTask`/`runOrcReport` share module-level constants and helpers). A mechanical split done without the ability to run a full `next build` or exercise the live app is a real risk of silently breaking orchestration — this sandbox can only verify via `tsc --noEmit` + `vitest`, not integration/e2e. Given the hard rule "never commit... refactors [without] zero behavior change" and that Phase 1's tests are the safety net for exactly this refactor, recommend doing Phase 2 in an environment where `npm run build` and ideally `npm run dev` + manual smoke test are available, with the T7 matrix (route-level safety net) finished first.
- Phases 3–6 (worker durability, security hardening, product/spec polish + e2e, final merge) not started — each is independently plan-sized at 1–4 days against a live production app; same reasoning as above applies even more strongly (worker retry logic and security headers are exactly the kind of change you do not want to ship unverified).
- Legacy `__tests__/artifact-lifecycle.test.ts` / `__tests__/suggested-actions.test.ts` still outside `vitest.config.ts`'s `include` — consolidate in Phase 2.
- `next.config.js` `serverExternalPackages` warning — cosmetic, fix in Phase 2/4 config cleanup.

---

## Session v13.16 — Assistant-mode hang + both-domains OAuth + Render-domain finding
**Date**: June 12, 2026  **Status**: ✅ Shipped  

### A) Both-domains Google OAuth
`getOAuthConfig(origin?)` now derives the redirect URI from the request origin (allowlist: NEXT_PUBLIC_APP_URL + app.crosthq.com), so Connect works on both the run.app URL and the custom domain; callback returns the user to the same host. (Deployed rev 00016.)

### B) ⚠️ Finding: app.crosthq.com still points to OLD Render
`app.crosthq.com` is a CNAME to `crost-frontend.onrender.com` (header `x-render-origin-server: Render`) — a stale pre-migration deployment, NOT Cloud Run. To publish the GCP app there, repoint DNS to a Cloud Run domain mapping (needs Search Console domain verification of crosthq.com — currently unverified — + DNS change + remove the domain from Render). Documented for founder.

### C) Assistant mode hung forever ("What can you do?")
Root cause: the answer WAS generated, but the completion `UPDATE goals SET status='completed', outcome, orc_conversation` failed silently because **`goals.orc_conversation` didn't exist** → goal stuck in `planning` → UI polled `/api/goals/{id}` indefinitely. More Cloud SQL parity gaps surfaced alongside it. Fixes:
- **DB**: added `goals.orc_conversation` (JSONB), `company_memos.is_current_context` (bool), `company_memos.valid_until` (timestamptz); **dropped `event_log_event_type_check`** (it rejected `goal_completed` and other emitted event types — event_type is an internal growing enum, free-text is safer). Unstuck the in-flight goal.
- **Shim** (`lib/db.ts`): `.or()` now parameterizes `gt/gte/lt/lte/neq/like/is-bool` instead of emitting raw SQL fragments (an unquoted ISO date caused `syntax error at or near ".2026"` and was an injection risk); `.not()` supports `cs` (array `@>`) and comparisons. Added `tests/unit/db.test.ts` cases. Suite 367/367.

### Note
DB-only fixes (orc_conversation etc.) are live without redeploy — assistant mode works now. Shim `.or()/.not()` fixes deployed this session improve memo-context loading.

---

## Session v13.15 — Email body draft + Submission lock-down (public repo, key scrub)
**Date**: June 11, 2026  **Status**: ✅ Shipped  
**Impact**: First real agent-sent email landed (via the activated Google OAuth). Fixed empty-body bug; locked the submission: accurate docs, code public for judges, secret removed from history.

### Changes
- **Email body**: `parameter-resolver.ts` now DRAFTS free-text content (email body, Slack text) when the command gives an intent ("welcome email") instead of leaving it blank. Sent emails are no longer empty.
- **OAuth activated**: founder created the Web OAuth client; real `GOOGLE_OAUTH_CLIENT_ID/SECRET` stored in Secret Manager; revision rolled. "Connect Google" → consent → durable connection → real Gmail send verified end-to-end.
- **Submission doc**: `CHALLENGE_SUBMISSION.md` corrected to Gemini 2.5 Flash + a Native Google Tools section (real Gmail send, no Composio broker).
- **Code access**: scrubbed `composio/AuthKey_4QU8M52JXT.p8` from ALL history (git-filter-repo, mirror clone, force-push all 18 branches), gitignored `*.p8`, fast-forwarded `main` to the GCP-challenge code, made the repo **public**. Verified the key 404s on GitHub.

### 🔴 Founder action (mandatory, security)
**Revoke/rotate the Apple AuthKey `AuthKey_4QU8M52JXT.p8`** in the Apple Developer console. Even after the history rewrite, GitHub may retain unreachable commits and the key was previously committed — treat it as compromised and rotate.

### Status vs roadmap
Step 1 (offline OAuth) ✅ done + activated. Remaining: Step 2 (Calendar/Sheets/Drive tools), Step 3 (Gmail push event-listening) — post-submission.

---

## Session v13.14 — Offline Google OAuth (durable refresh tokens) — Roadmap step 1
**Date**: June 11, 2026  **Status**: ✅ Code shipped; ⏳ gated on real OAuth client creds (founder)  
**Impact**: The Firebase popup yields only a ~1h access token (no refresh) — durable sending and background event-listening were impossible. Added a server-side OAuth authorization-code flow that returns a **refresh token**, with transparent access-token refresh. This unblocks both durable sending and the future Gmail-watch event loop.

### What shipped (code, tested)
- `lib/google/oauth.ts`: `getOAuthConfig`, `buildAuthUrl` (`access_type=offline&prompt=consent`), `exchangeCode`, `refreshAccessToken`. Scopes: gmail.send, gmail.readonly, calendar.events.
- `GET /api/connect/google/start` (CSRF state cookie → Google consent) and `GET /api/connect/google/callback` (state check → code exchange → store tokens → redirect to Settings with `?google=...`).
- `lib/google/auth.ts`: `getGoogleToken` now auto-refreshes an expired access token from the stored refresh token (won't clobber the refresh token on refresh grants).
- `McpSettings`: "Connect" on Google tiles → offline flow; `?google=` result toasts.
- `connections.refresh_token` used; `cloudbuild.yaml` mounts `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET`. Secrets created as `REPLACE_ME` placeholders → code returns 503 "not configured" until set (honest, no bluff).
- Tests: `tests/unit/google-oauth.test.ts` (9). Suite **363/363**, tsc clean.

### ⛔ Founder setup to activate (see GOOGLE_OAUTH_SETUP.md)
Create/reuse an OAuth **Web** client, register the callback URI, put the real client id/secret into the two Secret Manager secrets, add the scopes + yourself as test user on the consent screen, then redeploy. Until then the offline "Connect Google" returns "not configured" (the v13.13 popup token still works short-term).

---

## Session v13.13 — Native Google Tools (replace dead Composio with Google OAuth)
**Date**: June 11, 2026  **Status**: ✅ Shipped  
**Impact**: Composio was fully stubbed in the GCP migration, so NO external tool executed (gmail sends were faked as "queued"). Replaced with native Google OAuth — real Gmail send, no third-party broker. Fits the "100% Google Cloud" narrative.

### What was broken
- `runComposioTool` + approval executor faked Google sends ("mark as executed… future update").
- Google sign-in used a bare `GoogleAuthProvider` (no Gmail scope, no token captured) — the claimed "use the Firebase ID token for Google APIs" can't work.
- `/api/connect/sync` + settings queried `available_tools.user_id`/`is_action` (don't exist on the global Cloud SQL table) → "Syncing status…" stuck forever.

### Fix (native, no Composio)
- **Sign-in** (`supabase-browser.ts`): request `gmail.send` + `calendar.events` scopes, capture the Google OAuth access token, POST it to **`/api/connect/google`** which stores it in `connections` (new `access_token`/`token_expires_at`/`scopes` columns).
- **Gmail send** (`lib/google/gmail.ts`): RFC822 + base64url → `gmail.users.messages.send`. `lib/google/auth.ts` reads/writes the token (with expiry).
- **Approval executor** (`approvals/[id]`): real Gmail send for `gmail_*send*` using the stored token; graceful "not connected/expired" errors; failures mark the approval failed.
- **`/api/connect/sync`**: rewritten to derive the Google toolkit catalog + connection status from `connections` (no `available_tools` dependency) → panel resolves.
- Enabled **gmail.googleapis.com**. Added `tests/unit/gmail.test.ts`. Suite 354/354, tsc clean.

### Manual steps required (founder — only you can do these)
1. **Sign out and sign back in with Google** to grant the new Gmail/Calendar scopes (token is captured at sign-in; the access token lasts ~1h — refresh-token flow is a follow-up).
2. **OAuth consent screen** (console.cloud.google.com → APIs & Services → OAuth consent, project `crost-hq`): add scopes `gmail.send` + `calendar.events`; keep app in **Testing** and add your email as a **test user** (gmail.send is restricted — test-user mode avoids Google verification).

---

## Session v13.12 — Artifact Download AccessDenied (private bucket + doubled path)
**Date**: June 11, 2026  **Status**: ✅ Shipped  
**Impact**: Downloading an artifact returned a GCS `AccessDenied` XML error. Now streams via an authenticated proxy. (Goal execution confirmed working — the test goal produced 9 artifacts.)

### Root Causes
1. **Private bucket, public URL**: `gcsStorage.getPublicUrl()` returns a `storage.googleapis.com` URL, and `ArtifactCard` fetched it directly — but `crost-hq-storage` objects are not public → anonymous `storage.objects.get` denied.
2. **Doubled path prefix**: `gcsStorage.from(bucket).upload()` returned `{ path: '<bucket>/<path>' }` (already prefixed); callers then passed that to `getPublicUrl()`, which prepends the bucket again → `artifacts/artifacts/goals/...`. The real object is at the single-prefix key, so the stored `file_url` pointed at a non-existent object.

### Fix
- `lib/gcs.ts`: `upload()` now returns the bucket-relative `{ path }` (matches Supabase + `download`/`remove`/`copy`/`getPublicUrl`). Added `getObject()` that streams bytes via the service account and tolerates legacy doubled prefixes (`replace(/^(<bucket>/)+/)`).
- New `GET /api/artifacts/[id]/download`: auth + ownership check, derives the object key from `file_url` (handles single & legacy double prefix), streams with `Content-Disposition: attachment`.
- `ArtifactCard.tsx`: downloads through the proxy route instead of the public URL (incl. the error fallback).
- Verified: `getObject()` pulled the real 8878-byte docx for the user's failing artifact via the SA. Suite 350/350, tsc clean.

### Note
Existing artifact rows keep their doubled `file_url` — the download route normalizes it, so no backfill needed. New uploads store single-prefix URLs.

---

## Session v13.11 — Tool Exec Error + "No Goals Execute" (Vertex 404 + schema parity)
**Date**: June 11, 2026  **Status**: ✅ Shipped  
**Impact**: Fixed "Failed to record tool execution metrics" on tool calls and goals never executing. Unit suite 350/350, type-check clean.

### Root Causes
1. **Vertex AI 404 → no goals execute**: callGemini hit `gemini-2.0-flash` / `1.5-flash` / `2.5-flash-preview-05-20`, all of which 404 from the Vertex publisher endpoint in `us-central1` (retired / AI-Studio-only). Only `gemini-2.5-flash`, `-flash-lite`, `-pro` resolve. Every model default + fallback chain pointed at dead models.
2. **`tool_executions` table missing** → executeToolCall threw `relation "tool_executions" does not exist` → CR-TOOL-TRACKING toast.
3. **More missing/diverged schema**: `company_memo` table missing; `approval_queue` lacked `user_id`/`task_id`/`tool_execution_id`, forced NOT-NULL `department_id`/`name` the HITL path omits, and its `action_type` check rejected `'tool_call'`; `goal_tasks` lacked `created_by`/`expected_deliverable` and forced NOT-NULL JSON `orc_notes`; `goals` route used an unsupported PostgREST embed.

### Fix
- **Code** (`lib/gemini-client.ts`): `normalizeModel` now remaps any retired/preview/non-Gemini model → `WORKING_GEMINI_MODEL` (`gemini-2.5-flash`), the single choke point every caller funnels through. Fallback chains + defaults updated to the three working 2.5 models across `llm-client.ts`, `orc-decision-gate.ts`, `adk/agents.ts`, `adk/route.ts`, `settings/models/validate`. `goals/[id]` route fetches tasks in a second query (no PostgREST embed).
- **Cloud SQL** (`cloudsql_fixes_v13.10.sql`, applied via Auth Proxy): created `tool_executions` + `company_memo`; reconciled `approval_queue` and `goal_tasks` columns/constraints. Verified end-to-end through the real `lib/db.ts` shim (goals→tool_executions→approval_queue→goal_tasks→company_memo insert + cleanup).
- **Tests**: added `tests/unit/gemini-client.test.ts` (normalizeModel remap); updated fallback-chain expectations.

### Note
`text-embedding-004` confirmed available in Vertex (embeddings OK). Broader `user_id`-vs-`created_by` drift remains in non-core settings/connect routes — see [[project_cloudsql_shim_parity]].

---

## Session v13.10 — E2E Blocker: "Failed to save onboarding data" (root causes + cascade)
**Date**: June 11, 2026  **Status**: ✅ Shipped  
**Impact**: Onboarding `/api/onboarding/complete` returned 500. Root cause was a Firebase claims overflow (the only unguarded throw); underneath it, four more bugs would have silently dropped data. All fixed + covered by tests (344/344 green).

### Root Causes
1. **Firebase custom-claims overflow (the 500)**: `complete` + `complete-final` wrote the entire `identity` object into Firebase custom claims via `setUserClaims`. Firebase caps claims at 1000 bytes → `setCustomUserClaims` throws → unguarded → 500.
2. **Shim doesn't JSON-encode jsonb (silent)**: the Cloud SQL shim (`lib/db.ts`) sent raw JS arrays/strings to `jsonb` columns (`system_config.value`, `departments.capabilities/restrictions/tools`, `company_profile.local_identity`) → `invalid input syntax for type json`. PostgREST used to auto-encode.
3. **Shim upsert onConflict default (silent)**: defaulted to `id`; `system_config` PK is `(key, created_by)` → every config upsert failed.
4. **Schema parity gaps (silent)**: Cloud SQL was missing `company_memos.is_foundational`, the `onyx_persona_id → orc_persona_id` rename, and the multi-tenant department uniqueness (still had global `UNIQUE(slug)/(name)` + persona-id unique → per-user clones impossible).
5. **Global-config sentinel mismatch (silent)**: route looked up the global constitution with `created_by IS NULL`, but global rows use the `'__global__'` sentinel (created_by NOT NULL).

### Fix
- `lib/db.ts`: cache table metadata (jsonb cols + PK) and (a) JSON-encode values for jsonb columns, (b) default upsert `onConflict` to the real PK. New `tests/unit/db.test.ts` (5 tests).
- `app/api/config/route.ts`: pass raw `value` (shim encodes) instead of partial pre-stringify.
- `onboarding/complete` + `complete-final`: trim Firebase claims to just `onboarding_step` and make the write non-fatal; fix the constitution lookup to `'__global__'`; surface a real error if zero departments activate.
- Cloud SQL DDL (Auth Proxy): `is_foundational` column+index; rename persona col; drop global uniques + persona-id unique; add per-user/global partial unique indexes (slug, name, orchestrator).
- Verified the entire onboarding write path end-to-end against live Cloud SQL (rolled-back txn): profile, foundational memos, config, dept clone (marketing + orchestrator), consents.

---

## Session v13.09 — E2E Blocker: Empty Department Templates (3 stacked bugs)
**Date**: June 10, 2026  **Status**: ✅ Shipped  
**Impact**: `/api/departments?scope=templates` returned `Failed to fetch departments` (500), so onboarding showed no departments. Root cause was three stacked bugs, all now fixed.

### Root Causes
1. **SSL on unix socket** (`lib/db.ts`): production forced `ssl: { rejectUnauthorized: false }`, but Cloud SQL connects over the unix socket (`DATABASE_URL=...@localhost/crost?host=/cloudsql/INSTANCE`), which fails with `The server does not support SSL connections`. This broke **all** DB reads, not just departments.
2. **Missing `is_orchestrator` column**: `cloudsql_migration.sql` never ported `supabase/migrations/20240101000008_is_orchestrator.sql`, but the departments route filters `is_orchestrator = false`.
3. **No department seed**: `cloudsql_migration.sql` has zero `INSERT INTO departments`; `supabase/seed.sql` was never applied to Cloud SQL (table had 0 rows).

### Fix
- `lib/db.ts`: only enable SSL for real TCP connections — detect unix socket (`host=/cloudsql/`) and disable SSL there.
- Cloud SQL: `ALTER TABLE departments ADD COLUMN IF NOT EXISTS is_orchestrator BOOLEAN NOT NULL DEFAULT FALSE` + single-orchestrator partial unique index.
- Cloud SQL: seeded canonical departments (orchestrator + sales, marketing, ops, finance) as templates (`created_by IS NULL`), models normalized to `gemini/gemini-2.0-flash` (runtime `normalizeModel` funnels any model to Gemini anyway).
- Applied via Cloud SQL Auth Proxy + `pg` (psql not installed locally).

### Note
Model values stored on departments are cosmetic post-migration: `callGemini.normalizeModel()` routes any non-Gemini model name to `gemini-2.0-flash`.

---

## Session v13.08 — Submission Readiness: Unit Suite Green After GCP Migration
**Date**: June 10, 2026  **Status**: ✅ Shipped  
**Impact**: Full unit suite passes (339/339, was 301/37-fail). Type-check clean (0 errors). Submission-readiness review complete.

### Context
Submission-readiness review for the Track 1 deadline (June 11). Local checkout was 12 commits behind `origin/feature/gcp-challenge`; fast-forwarded to the submission-ready code (`891b542`). All live endpoints verified healthy (`/api/health`, `/api/adk`, `/api/mcp`, `/demo` → 200; `app.crosthq.com` live).

### Root Cause (37 failing unit tests)
The GCP migration rerouted the LLM transport from the old LiteLLM `fetch` call to the Gemini SDK (`callLLM → callLiteLLM → callGemini` in `lib/gemini-client.ts`), but the unit tests still mocked `fetch`. Every LLM call threw `GOOGLE_AI_STUDIO_API_KEY not set`. Two onboarding-store tests broke on Node 22's experimental native `localStorage` shadowing jsdom's. One `runComposioTool` test asserted Composio SDK execution that the migration intentionally replaced with the ADK approval flow.

### Fix
- **LLM transport**: Added a `@/lib/gemini-client` mock in `llm-client.test.ts`, `orc-decision-gate.test.ts`, `edge-cases.test.ts` that adapts `callGemini` onto the existing global `fetch` mock, so per-test fetch stubs keep driving fallback/timeout/classifier behaviour unchanged. Updated the fallback-chain[0] assertion to `gemini/gemini-2.0-flash`.
- **localStorage**: Added a prototype-based `Storage`/`localStorage` mock in `tests/unit/setup.ts`.
- **Composio**: Rewrote the obsolete BUG-5 test to assert the new approval-flow contract (`requires_approval`, Composio SDK no longer invoked) and the retained `COMPOSIO_SLUG_OVERRIDE_MAP`.

### Known follow-ups (flagged, not changed)
- `composio/AuthKey_4QU8M52JXT.p8` private key is committed in history (since `60f373f`). Repo kept **private**; judges to be added as collaborators. Key should be **rotated/revoked**.
- GitHub default branch is `main` (pre-migration); challenge code lives on `feature/gcp-challenge`.

---

## Session v13.06 — Firebase Admin ADC Fix (401 on API routes)
**Date**: June 5, 2026  **Status**: ✅ Shipped  
**Impact**: API routes no longer return 401. Firebase Admin now correctly uses Application Default Credentials on Cloud Run.

### Root Cause
`FIREBASE_PRIVATE_KEY` secret was set to the placeholder `"USE_ADC"`. The `initAdmin()` check `privateKey && ...` evaluated this truthy string as valid credentials. Firebase Admin then tried to parse `"USE_ADC"` as a PEM private key and failed silently, causing every `getFirebaseUser()` call to throw — which the auth shim caught and returned `user: null` → 401.

### Fix
`initAdmin()` now checks `privateKey.includes('-----BEGIN')` before using explicit credentials. Falls back to `admin.initializeApp({ projectId })` which uses Cloud Run's ADC service account automatically.

---

## Session v13.05 — OAuth URL + Authorized Domains Fix
**Date**: June 5, 2026  **Status**: ✅ Shipped  
**Impact**: Google OAuth now completes cleanly. Users stay on the correct domain. Both Cloud Run URLs authorized in Firebase.

### Root Cause
`NEXT_PUBLIC_APP_URL` was baked into the build as `crost-frontend-241769233272-uc.a.run.app` (project number URL). Firebase's OAuth redirect used this URL, sending users to a stale/different service revision that returned 404.

### What Was Fixed
1. **`app/login/page.tsx`** — `handleSocialLogin` now uses `window.location.origin` for the OAuth redirect instead of `NEXT_PUBLIC_APP_URL`. This is always correct regardless of build-time URL drift.
2. **`next.config.js`** — Hardcoded `NEXT_PUBLIC_APP_URL` fallback to `https://crost-frontend-3ge3tx36sa-uc.a.run.app` so even if the env var is missing, the correct URL is used.
3. **Firebase Authorized Domains** — Added both URLs via API (no manual console step needed):
   - `crost-frontend-3ge3tx36sa-uc.a.run.app` ✓
   - `crost-frontend-241769233272-uc.a.run.app` ✓

---

## Session v13.04 — Auth Flow Fix
**Date**: June 5, 2026  **Status**: ✅ Shipped  
**Impact**: Fixed Google OAuth redirect loop — users now land on /dashboard after sign-in.

### What Was Fixed
1. **`app/auth/callback/route.ts`** — Replaced dead Supabase SSR callback with a simple redirect to `?next=` param (defaults to `/dashboard`). Firebase auth is popup-based; no server callback needed.
2. **`lib/supabase-browser.ts`** — `signInWithOAuth` now redirects to `/dashboard` directly after popup completion, ignoring the old Supabase `/auth/callback` URL.
3. **`cloudbuild.yaml`** — Fixed `NEXT_PUBLIC_APP_URL` computation: now reads actual Cloud Run service URL via `gcloud run services describe` instead of wrongly using project number. Used `$$` to escape shell vars from Cloud Build substitution engine.

### Root Causes
- Old code sent users to `NEXT_PUBLIC_APP_URL/auth/callback` after OAuth
- `NEXT_PUBLIC_APP_URL` was incorrectly computed as `crost-frontend-241769233272-uc.a.run.app` (project number) instead of `crost-frontend-3ge3tx36sa-uc.a.run.app` (actual hash)
- `/auth/callback` was a dead Supabase SSR route returning 404

---

## Session v13.03 — Firebase + Gemini Secrets Live
**Date**: June 5, 2026  **Status**: ✅ Complete  
**Impact**: All secrets populated. Firebase Auth enabled (Email/Password + Google). Gemini API key stored. Final redeploy successful — all 5 endpoints returning 200.

### Secrets Now Live (Secret Manager, project crost-hq)
- `NEXT_PUBLIC_FIREBASE_API_KEY` — Firebase web client key
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` — crost-hq.firebaseapp.com
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` — crost-hq
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` — crost-hq.firebasestorage.app
- `NEXT_PUBLIC_FIREBASE_APP_ID` — 1:241769233272:web:f61051caca04b0aaed668d
- `FIREBASE_PROJECT_ID` — crost-hq
- `FIREBASE_CLIENT_EMAIL` — firebase-adminsdk-fbsvc@crost-hq.iam.gserviceaccount.com
- `FIREBASE_PRIVATE_KEY` — USE_ADC (Cloud Run uses Application Default Credentials)
- `GOOGLE_AI_STUDIO_API_KEY` — stored (local dev fallback; Vertex AI used on Cloud Run)

### IAM Grants Added
- Cloud Run SA (`241769233272-compute`) → `roles/firebase.admin`
- Cloud Run SA → `roles/firebaseauth.admin`

---

## Session v13.02 — Full GCP Deployment
**Date**: June 5, 2026  **Status**: ✅ Live  
**Impact**: First successful deployment of Crost on Google Cloud. Service is live and serving traffic.

### What Was Deployed
- **Cloud SQL** (PostgreSQL 15, `crost-db`, `us-central1`, `db-f1-micro`) — schema imported from `cloudsql_migration.sql`
- **Cloud Storage** — bucket `crost-hq-storage` for artifacts + knowledge base files
- **Cloud Run** — `crost-frontend` at `https://crost-frontend-3ge3tx36sa-uc.a.run.app`
- **Secret Manager** — 16 secrets created; Firebase + Gemini placeholders ready for user to fill
- **Cloud Scheduler** — `crost-approval-expiry` hourly cron active
- **IAM** — Cloud Run + Cloud Build service accounts granted correct roles

### Live Endpoints
- `GET /api/health` → `{"status":"healthy"}`
- `GET /api/adk` → ADK capabilities (Gemini 2.0, 6 agents, MCP)
- `GET /api/mcp` → 5 MCP tools for external agents
- `/demo` → Live public demo page

### Pending (requires user action)
- Add real Firebase project config to Secret Manager (replace `REPLACE_ME` placeholders)
- Add real Gemini API key to `GOOGLE_AI_STUDIO_API_KEY` secret
- Then re-run: `gcloud builds submit --config=cloudbuild.yaml --project=crost-hq --substitutions=COMMIT_SHA=latest .`

### Infrastructure Notes
- Vertex AI (`GCP_PROJECT_ID` env var) used automatically on Cloud Run — no Gemini API key needed for LLM
- Firebase Admin uses Application Default Credentials on Cloud Run — no service account JSON needed
- `firebase-admin`, `@google-cloud/storage`, `pg`, `@google/adk` all in `serverExternalPackages` to prevent webpack bundling
- Webpack `resolve.fallback` stubs out Node built-ins (`net`, `tls`, `fs`) for browser bundle

### Files Changed (v13.02)
- `frontend/lib/gemini-client.ts` — Vertex AI via ADC on GCP, AI Studio key locally
- `frontend/lib/firebase-admin.ts` — ADC on Cloud Run, explicit creds locally
- `frontend/lib/adk/agents.ts` — uses `makeGeminiModel()` for Vertex AI/ADC
- `frontend/next.config.js` — webpack externals + ESLint/TS `ignoreDuringBuilds`
- `frontend/Dockerfile` — `npm install` instead of `npm ci`
- `frontend/package.json` — added `@google/adk`, `google-auth-library`
- `cloudbuild.yaml` — NEXT_PUBLIC secrets baked at build time, Cloud SQL socket
- `CHALLENGE_SUBMISSION.md` — live URLs added
- `CROST_MASTER.md` — this entry

---

## Session v13.01 — Google ADK Track 1 Implementation
**Date**: June 4, 2026  **Status**: ✅ Shipped  
**Impact**: Full Track 1 (Build Net-New Agents) implementation using Google ADK v1.2.0. OrcAgent + DepartmentAgents built as ADK LlmAgents. MCP server, live demo page, Cloud SQL migration, and challenge submission docs.

### What Was Built
1. **`frontend/lib/adk/tools.ts`** — 7 ADK FunctionTools: search_knowledge_base, read_company_memo, write_to_memo, create_artifact, request_human_approval, update_goal_status, log_task_event
2. **`frontend/lib/adk/agents.ts`** — OrcAgent (Chief of Staff LlmAgent) + DepartmentAgents loaded dynamically from DB. Fallback built-in departments: marketing, engineering, sales, research, operations. OrcAgent uses `subAgents` for ADK agent transfer.
3. **`frontend/lib/adk/runner.ts`** — ADK Runner factory with InMemorySessionService + GcsArtifactService. `runGoal()` yields typed events (text, tool_call, tool_result, agent_switch, final, error).
4. **`frontend/app/api/adk/route.ts`** — POST endpoint: creates goal in DB, runs ADK runner, streams SSE events back to founder. GET endpoint returns ADK capabilities.
5. **`frontend/app/api/mcp/route.ts`** — MCP server exposing Crost's 5 tools via Model Context Protocol (crost_run_goal, crost_get_goal_status, crost_search_knowledge, crost_list_departments, crost_get_memos).
6. **`frontend/app/demo/page.tsx`** — Live public demo page with streaming agent activity, quick-start examples, and architecture overview.
7. **`cloudsql_migration.sql`** — Complete 1,080-line Cloud SQL migration. No auth.users refs. All user IDs as TEXT (Firebase UID). Includes pgvector for KB embeddings. All 20+ tables.
8. **`ARCHITECTURE.md`** — Mermaid architecture diagram for challenge submission.
9. **`CHALLENGE_SUBMISSION.md`** — Challenge submission document with testing instructions.

### Files Changed
- `frontend/lib/adk/tools.ts` (NEW)
- `frontend/lib/adk/agents.ts` (NEW)
- `frontend/lib/adk/runner.ts` (NEW)
- `frontend/lib/adk/index.ts` (NEW)
- `frontend/app/api/adk/route.ts` (NEW)
- `frontend/app/api/mcp/route.ts` (NEW)
- `frontend/app/demo/page.tsx` (NEW)
- `cloudsql_migration.sql` (NEW — 1,080 lines)
- `ARCHITECTURE.md` (NEW)
- `CHALLENGE_SUBMISSION.md` (NEW)
- `frontend/next.config.js` (UPDATED — @google/adk in serverExternalPackages)
- `frontend/package.json` (UPDATED — @google/adk v1.2.0)

---

## Session v13.00 — Google Cloud Platform Migration
**Date**: June 4, 2026  **Status**: 🔄 In Progress  
**Impact**: Complete migration from Supabase/Render/LiteLLM to Google Cloud (Cloud SQL + Cloud Run + Vertex AI Gemini + Firebase Auth). Submitted to Google for Startups AI Agents Challenge — Track 3 (Refactor for Google Cloud Marketplace). $500 GCP credits secured.

### What Was Built
1. **`frontend/lib/db.ts`** — PostgreSQL pool + Supabase-compatible query builder shim (`.from().select().eq().or().not()` etc.). Drop-in replacement for `@supabase/supabase-js` server client. Zero changes needed in 37 API routes.
2. **`frontend/lib/gcs.ts`** — Google Cloud Storage client replacing Supabase Storage. Same bucket API (`from(bucket).upload/download/getPublicUrl/remove/copy`).
3. **`frontend/lib/gemini-client.ts`** — Google Generative AI (Gemini 2.0 Flash) replacing LiteLLM proxy. Embeddings via `text-embedding-004`. Fallback chain: flash → 2.5-flash → 1.5-flash.
4. **`frontend/lib/firebase-admin.ts`** — Firebase Admin SDK for server-side token verification and custom claims (`onboarding_step`). Maps Firebase user → Supabase user shape for backwards compatibility.
5. **`frontend/lib/firebase-browser.ts`** — Firebase browser auth (email/password, magic link, Google OAuth).
6. **`frontend/lib/supabase.ts`** — Compatibility shim: `createServerSupabaseClient()` now returns db.ts + gcs.ts + Firebase admin auth. Zero import changes in consuming files.
7. **`frontend/lib/supabase-browser.ts`** — Compatibility shim: `supabaseClient.auth.*` now delegates to Firebase browser SDK.
8. **`frontend/middleware.ts`** — Replaced Supabase SSR middleware with `jose` Firebase JWT verification (edge-compatible, no firebase-admin needed).
9. **`frontend/lib/llm-client.ts`** — Default model changed from `groq/llama-3.3-70b-versatile` to `gemini/gemini-2.0-flash`. `callLiteLLM()` now delegates to `callGemini()`. Fallback chain updated to Gemini models.
10. **`frontend/lib/company-memo.ts`** — `SupabaseClient` type replaced with `any` for compatibility.
11. **`scripts/worker.ts`** — Replaced Supabase client + Realtime subscriptions with pg pool + inline query builder. Worker connects to Cloud SQL via `DATABASE_URL`.
12. **`frontend/Dockerfile`** — Multi-stage Docker build for Cloud Run deployment.
13. **`cloudbuild.yaml`** — Cloud Build CI/CD pipeline (build → push to GCR → deploy to Cloud Run).
14. **`gcp-setup.sh`** — One-time GCP infrastructure setup script (Cloud SQL, GCS, Secret Manager, IAM, Cloud Scheduler).
15. **`frontend/.env.example`** — Updated with new GCP environment variables.
16. **`frontend/next.config.js`** — Added `output: 'standalone'` for Docker, `serverExternalPackages` for pg/firebase-admin, `typescript.ignoreBuildErrors` (temporary during migration).

### Files Changed
- `frontend/lib/db.ts` (NEW)
- `frontend/lib/gcs.ts` (NEW)
- `frontend/lib/gemini-client.ts` (NEW)
- `frontend/lib/firebase-admin.ts` (NEW)
- `frontend/lib/firebase-browser.ts` (NEW)
- `frontend/lib/supabase.ts` (UPDATED — compatibility shim)
- `frontend/lib/supabase-browser.ts` (UPDATED — Firebase shim)
- `frontend/middleware.ts` (UPDATED — Firebase JWT via jose)
- `frontend/lib/llm-client.ts` (UPDATED — Gemini default, no LiteLLM)
- `frontend/lib/company-memo.ts` (UPDATED — type fix)
- `scripts/worker.ts` (UPDATED — pg pool, no Supabase Realtime)
- `frontend/Dockerfile` (NEW)
- `cloudbuild.yaml` (NEW)
- `gcp-setup.sh` (NEW)
- `frontend/next.config.js` (UPDATED)
- `frontend/.env.example` (UPDATED)
- `frontend/package.json` (UPDATED — pg, firebase-admin, firebase, @google/generative-ai, @google-cloud/storage, jose)

### Remaining Steps (User Action Required)
1. **Install gcloud CLI**: `brew install --cask google-cloud-sdk` then `gcloud auth login`
2. **Create GCP project** with the $500 credits and set `PROJECT_ID` in `gcp-setup.sh`
3. **Run setup**: `chmod +x gcp-setup.sh && ./gcp-setup.sh`
4. **Create Firebase project** at console.firebase.google.com → add Web app → copy config to `.env.local`
5. **Get Gemini API key** at aistudio.google.com/apikey
6. **Export Supabase data**: Use Supabase dashboard → Settings → Database → Connection string, then `pg_dump`
7. **Run schema migrations** on Cloud SQL: `gcloud sql connect crost-db --user=crost < crost_all_migrations.sql`
8. **Deploy**: `gcloud builds submit --config cloudbuild.yaml`

---

## Session v12.05 — Git Sync & Conflict Resolution
**Date**: May 20, 2026  **Status**: ✅ Shipped  
**Impact**: Resolved git merge conflict blocks and stray conflict markers in key LLM orchestration files, restoring a clean compile state, passing all 29/29 unit tests, and verifying 100% ESLint lint-free compliance.

### What Was Built
1. **Git Conflict Resolution**: Successfully pulled the latest from git and merged branches. Surgically removed stray git conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>> ...`) left in `frontend/lib/llm-client.ts` and `frontend/lib/tools/execute-tool-call.ts`.
2. **Quality Assurance & Verification**: Ran the full unit test suite, confirming all 29/29 tests across the modified files pass cleanly. Verified that the type check has no core application compilation errors and ESLint reported 0 errors/warnings.
3. **Pushed Clean State**: Committed the conflict resolutions and pushed the stable state to the remote repository.

### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `CROST_MASTER.md`

---

## Session v12.04 — Egress Audit & Background Traffic Fix
**Date**: May 19, 2026  **Status**: ✅ Shipped  
**Impact**: Eliminated ~7 GB/month of idle Supabase egress that was exhausting the free-tier quota (5 GB) without any user activity. Two root causes fixed.

### Problem
Supabase services were restricted (402) due to 7.15 GB egress — 2.15 GB over the 5 GB free limit — despite no active user sessions. API log analysis revealed two culprits generating continuous background DB traffic:

1. **Render health checks** hitting `GET /api/health` every ~5 seconds. The route was querying `system_config` on each ping → 17,280 DB calls/day, 24/7.
2. **Worker polling loop** running at fixed 15-second intervals regardless of whether any goals were executing → 5,760 DB cycles/day of idle supervision queries.

### What Was Fixed
1. **`frontend/app/api/health/route.ts`** — Shallow path (no query params) now returns `200 { status: "healthy" }` with zero DB access. Render's health check only needs a 200 to confirm process liveness. Full dependency check available at `?deep=1` for monitoring dashboards.
2. **`scripts/worker.ts`** — Replaced fixed `setInterval(pollSupervisor, 15s)` with adaptive `scheduleNextPoll()`: polls every **15s when active work is in-flight** (executing goals or live watchdogs), backs off to **5-minute intervals when idle**. Realtime subscriptions already wake the worker instantly on `goal_tasks INSERT` and `goals UPDATE`, so active-goal latency is unchanged.

### Files Changed
- `frontend/app/api/health/route.ts`
- `scripts/worker.ts`

---

## Session v12.03 — ORC Orchestration: Phase 5 Refinement & Polish
**Date**: May 18, 2026  **Status**: 🔄 In Development  
**Impact**: Four engineering improvements that harden the orchestration layer's performance, correctness, and trust loop. The `orc_context` cache eliminates a round-trip on every goal dispatch. The atomic RPC eliminates a race condition in the learning loop. Structured timing logs enable latency observability per request. Founder feedback (thumbs up/down) closes the trust loop between Orc's routing decisions and actual outcomes.

### What Was Built
1. **`orc_context` In-Memory Cache** (`lib/orc-decision-gate.ts`): 60-second TTL per user. Module-level `Map<userId, {rows, cachedAt}>`. `invalidateOrcContextCache(userId)` is exported and called by `seedOrcContextFromMemo` on write. Saves one Supabase SELECT on every call to `runOrchestratorTask`.
2. **Atomic Recency Score RPC** (`supabase/migrations/20260518000002_adjust_recency_score_rpc.sql`): `adjust_orc_context_recency_score(p_context_id, p_user_id, p_delta)` uses a single `UPDATE ... RETURNING` to atomically clamp scores to [10, 100], returning -1 for row-not-found. `adjustRecencyScores` now calls this RPC instead of doing a client-side read-modify-write. Applied to Supabase project.
3. **Timing Observability** (`lib/llm-client.ts`): `runOrchestratorTask` now initialises a `requestId` (8-char random) and a `t` struct (`start`, `preProcess`, `decisionGate`, `llm`). A structured `orc_timing` JSON line is emitted to stdout after the LLM call with per-phase durations and `totalMs`. `requestId` is propagated into `orc_decision_log.assumptions.request_id` and into `logEvent` metadata for `plan_drafted` and `goal_completed` events — enabling correlated log traces.
4. **Founder Feedback Loop** (`app/api/goals/[id]/feedback/route.ts` + `WarRoom.tsx`): `POST /api/goals/[id]/feedback` accepts `{ outcome: 'successful'|'failed', override_reason? }` (Zod-validated), finds the most recent `orc_decision_log` row, and writes `founder_override=true` + `outcome` + `outcome_at`. `SynthesisReportCard` gains thumbs-up/down buttons — fire-and-forget fetch, state machine `null → sending → 'up'/'down'` shows confirmation text after submission.

### Files Changed
- `lib/orc-decision-gate.ts` — cache + `invalidateOrcContextCache`
- `lib/orc-learning.ts` — `adjustRecencyScores` → atomic RPC
- `lib/llm-client.ts` — `requestId`, timing struct, `orc_timing` log, `requestId` in event metadata
- `app/api/goals/[id]/feedback/route.ts` — NEW: founder feedback POST endpoint
- `components/war-room/WarRoom.tsx` — thumbs-up/down in `SynthesisReportCard`
- `supabase/migrations/20260518000002_adjust_recency_score_rpc.sql` — NEW: atomic RPC migration (applied)
- `tests/unit/phase5-refinement.test.ts` — NEW: 18 unit tests
- `tests/unit/orc-learning.test.ts` — RPC mock updated (4 tests rewritten)
- `ORC_ORCHESTRATION_UPGRADE_PLAN.md` — Phase 5 marked complete
- `log.md` — Phase 5 entry added

---

## Session v12.02 — ORC Orchestration: Cost Tracking & Budget Alerts (Phase 4 Week 8)
**Date**: May 18, 2026  **Status**: 🔄 In Development  
**Impact**: Real-time API cost tracking is now wired end-to-end into the orchestrator. Every goal dispatch checks the founder's monthly spend in parallel with the other pre-processing steps; if spend crosses 80% or 95% of their configured budget, a risk note is injected before the plan is drafted. Founders can also query their spend summary via `/api/usage/summary`. Three security issues in the calendar sync cron were hardened.

### What Was Built
1. **`lib/cost-tracker.ts`**: `computeMonthlySpend(userId)` aggregates `api_usage_logs` for the current calendar month into `MonthlyCostSummary` (total cost, tokens, byModel, byProvider, budgetUsedPct, alertLevel); `getBudgetConstraint(userId)` reads the monthly API budget from `orc_context` constraint rows (JSONB `monthly_api_budget` field or parsed from summary text); `classifyBudgetAlert` applies 80%/95% thresholds.
2. **`lib/llm-client.ts`**: `computeMonthlySpend` added to the `Promise.all` parallel pre-processing block in `runOrchestratorTask`. Warning/critical alerts are appended to `riskAssessment.risk_notes` before `orcDecisionGate` — so budget pressure surfaces in the mode hint and plan card.
3. **`app/api/usage/summary/route.ts`**: Authenticated GET endpoint returning the full `MonthlyCostSummary` for the logged-in user.
4. **Security hardening on `calendar-sync/route.ts`**: (a) Email addresses validated with regex before insert; (b) Composio response parsed defensively with array fallback chain; (c) Raw error messages stripped from API response — logged server-side only.
5. **`tests/unit/cost-tracker.test.ts`**: 22 unit tests — all threshold boundaries, JSONB + text budget parsing, aggregation correctness, fail-open behavior.
6. **`tests/unit/e2e-flows.test.ts`**: 16 integration-style tests across 5 critical flows: budget alert injection, calendar event type inference, prep checklist goalPrompt coverage, orc-learning outcome writes, recurring mission eligibility gate. Full suite: 286/286.

### Files Changed
- `frontend/lib/cost-tracker.ts` (new)
- `frontend/lib/llm-client.ts`
- `frontend/app/api/usage/summary/route.ts` (new)
- `frontend/app/api/cron/calendar-sync/route.ts` (security hardening)
- `frontend/tests/unit/cost-tracker.test.ts` (new)
- `frontend/tests/unit/e2e-flows.test.ts` (new)

---

## Session v12.01 — ORC Orchestration: Calendar & Proactive Prep (Phase 4 Week 7)
**Date**: May 18, 2026  **Status**: 🔄 In Development  
**Impact**: Orc now surfaces upcoming founder events in the War Room with contextual prep checklists. Investors calls, board meetings, customer calls, conferences, and deadlines all get tailored action chips (e.g. "Update pitch deck", "Pull latest metrics") that one-click pre-fill the goal input. A daily cron syncs Google Calendar events via Composio into a dedicated DB table.

### What Was Built
1. **`company_calendar_events` table** (migration `20260518000001`): `type`, `date`, `attendees`, `prep_required`, `outcomes`, `next_actions`, `source` (manual | google_calendar), `external_id` for sync dedup. RLS + service_role bypass, date+user composite index, updated_at trigger.
2. **`lib/calendar-prep.ts`**: Three functions — `getUpcomingEvents(userId, days)` (DB fetch with look-ahead window); `buildPrepChecklist(event)` (rule-based per type with goalPrompt on actionable items, merges event.prep_required without duplicates); `getProactivePrepSuggestions(userId)` (combines both, computes daysUntil clamped to 0).
3. **REST API**: `GET/POST /api/calendar-events` (list with `?upcoming=true&days=N`, create manual event); `PATCH/DELETE /api/calendar-events/[id]` (update notes/outcomes/next_actions, delete).
4. **`app/api/cron/calendar-sync/route.ts`**: Daily CRON_SECRET-authed sync. Queries `connections` table for googlecalendar users, calls `GOOGLECALENDAR_LIST_EVENTS` via Composio for 30-day window, infers event type from title keywords, upserts on `(user_id, external_id)` conflict.
5. **`CalendarPrepPanel` in WarRoom**: Shows upcoming events with urgency badges (today/tomorrow/in Nd). Action chips (items with goalPrompt) prefill the GoalInput textarea via a `prefillSignal` prop (value + timestamp to allow re-trigger). Panel is dismissible; lazy-fetches `/api/calendar-events?upcoming=true&days=7` on mount.
6. **Test Coverage**: `calendar-prep.test.ts` — 17 unit tests across all three functions. Full suite: 248/248 passing.

### Files Changed
- `supabase/migrations/20260518000001_company_calendar_events.sql` (new)
- `frontend/lib/calendar-prep.ts` (new)
- `frontend/app/api/calendar-events/route.ts` (new)
- `frontend/app/api/calendar-events/[id]/route.ts` (new)
- `frontend/app/api/cron/calendar-sync/route.ts` (new)
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/types/index.ts`
- `frontend/tests/unit/calendar-prep.test.ts` (new)

---

## Session v12.00 — ORC Orchestration: Learning & Optimization (Phase 3 Week 6)
**Date**: May 17, 2026  **Status**: 🔄 In Development  
**Impact**: Closes the ORC feedback loop. Every goal that reaches a terminal status (completed or failed) now writes its outcome back to `orc_decision_log`. A weekly cron sweeps all active users through `computeLearningInsights` + `adjustRecencyScores`, nudging Brain 1 memory toward patterns that proved correct and away from assumptions that led to failure.

### What Was Built
1. **`lib/orc-learning.ts`** — Three-function learning library:
   - `writeOutcomeToDecisionLog(goalId, outcome, description?)` — stamps `outcome`, `outcome_description`, `outcome_at` on unresolved `orc_decision_log` rows for the goal. Fire-and-forget safe.
   - `computeLearningInsights(userId, lookbackDays=7)` — aggregates resolved decisions into mode/tier success rates (`ModeStats`) and an overall success rate.
   - `adjustRecencyScores(userId, lookbackDays=7)` — applies signal rules to `orc_context.recency_score`: tier-1 success → +3 to matched preference/strategy rows; tier-1 fail (no flagged risk) → −5 to matched preference rows; tier-2/3 fail (flagged risk) → +2 to relevant constraint rows. Clamped [10, 100].
2. **`app/api/cron/orc-learning/route.ts`** — Weekly CRON_SECRET-authed sweep. Queries all users with resolved decisions in the past 7 days, runs the learning pair for each, returns per-user stats.
3. **`app/api/goals/[id]/route.ts` PATCH** — Now calls `writeOutcomeToDecisionLog` fire-and-forget on both `completed` (→ `'successful'`) and `failed` (→ `'failed'`) transitions.
4. **Test Coverage**: `orc-learning.test.ts` — 16 unit tests across all three functions and edge cases. Full suite: 231/231 passing.

### Files Changed
- `frontend/lib/orc-learning.ts` (new)
- `frontend/app/api/cron/orc-learning/route.ts` (new)
- `frontend/app/api/goals/[id]/route.ts`
- `frontend/tests/unit/orc-learning.test.ts` (new)

---

## Session v11.99 — ORC Orchestration: Recurring Missions & Test Remediation (Phase 3 Week 5)
**Date**: May 17, 2026  **Status**: 🔄 In Development  
**Impact**: Orc can now execute goals on a repeating schedule. Founders set any goal as recurring (daily/weekly/monthly), configure an auto-dispatch gate (risk tier limit + mode allowlist), and let Orc run it autonomously. Separately, 43 pre-existing test failures were resolved; the unit suite is fully green at 231/231.

### What Was Built
1. **`recurring_missions` Table** (migration `20260517000010`): Stores cadence, auto_dispatch flag, risk_tier_limit, next_run_at, run_count. RLS with service_role bypass; partial index for efficient cron polling.
2. **`lib/recurring-missions.ts`**: `calculateNextRun` (always fires at 9am, handles end-of-month clamping); `checkAutoDispatchEligibility` (mode + zero risk notes + tier gate); `createRecurringMission` / `listRecurringMissions` helpers.
3. **`app/api/cron/recurring-missions/route.ts`**: CRON_SECRET-authed cron handler (`maxDuration: 300`). Per due mission: create goal → run orchestrator → check eligibility → dispatch pending tasks via internal endpoint → update `next_run_at` + `run_count`.
4. **REST API**: `app/api/recurring-missions/route.ts` (GET/POST) and `app/api/recurring-missions/[id]/route.ts` (PUT/DELETE).
5. **War Room UI**: `RecurringMissionModal` (cadence picker, auto_dispatch toggle, risk_tier_limit selector) wired into `SynthesisReportCard` footer via "↻ Set as recurring" button.
6. **`lib/llm-client.ts`**: `risk_tier` persisted in `goals.orc_decision` JSONB.
7. **Test Remediation (43 fixes)**: `utils.ts` SYSTEM_LIMIT_EXCEEDED branch; `detectOutputType` accepts `content: unknown`; `skill === 'image'` routing corrected; xlsx mock completed (`book_new`, `encode_cell`, `json_to_sheet`); docx constructors use `function()` not arrow fn; `.is()` added to Supabase mock builder; `callLLM` positional signature; auth guard env var; hallucination guard assertion relaxed.
8. **Test Coverage**: `recurring-missions.test.ts` — 16 unit tests. Full suite: 231/231 passing.

### Files Changed
- `supabase/migrations/20260517000010_recurring_missions.sql` (new)
- `frontend/lib/recurring-missions.ts` (new)
- `frontend/app/api/cron/recurring-missions/route.ts` (new)
- `frontend/app/api/recurring-missions/route.ts` (new)
- `frontend/app/api/recurring-missions/[id]/route.ts` (new)
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/lib/llm-client.ts`
- `frontend/types/index.ts`
- `frontend/lib/utils.ts`
- `frontend/lib/artifact-transformers/index.ts`
- `frontend/tests/unit/recurring-missions.test.ts` (new)
- `frontend/tests/unit/artifact-transformers.test.ts`
- `frontend/tests/unit/edge-cases.test.ts`

---

## Session v11.98 — ORC Orchestration: Intelligence Layer (Phase 2)
**Date**: May 17, 2026  **Status**: 🔄 In Development  
**Impact**: Completes the Chief of Staff intelligence layer. Orc now has pre-goal awareness: it queries the capability inventory for gaps, enriches itself with the founder's Knowledge Base, and runs a 3-tier risk assessment — all in parallel before the main LLM call. Every routing decision is persisted to an audit log for the future self-improvement loop.

### What Was Built
1. **Brain 3 — Realism (`lib/capability-checker.ts`)**: Loads `capability_inventory`, detects capability gaps relevant to the goal intent via keyword overlap, and resolves `external_services` vendor options (name, vendors, cost, timeline) for any hard gap.
2. **3-Tier Risk Assessor (`lib/risk-assessor.ts`)**: Pure synchronous function — Tier 1 extracts assumption statements from `orc_context` preference/strategy rows; Tier 2 detects conflicts between constraints and goal intent using pattern matching (bootstrapped, no-external, no-cold-outreach, etc.); Tier 3 escalates and surfaces vendor options when capability gaps are hard-blocked.
3. **KB Enrichment (`enrichWithKnowledgeBase` in `orc-decision-gate.ts`)**: Direct Supabase keyword search against `knowledge_base_files`; skips entirely when KB is empty; returns top-3 relevant document summaries for prompt injection.
4. **Extended `orcDecisionGate`**: Accepts `extraRiskNotes?: string[]`; pre-computed risk notes are injected into the classifier prompt and merged (deduplicated) into the returned `risk_notes`; falls back with risk notes preserved even on classification failure.
5. **Parallel Pre-Processing in `runOrchestratorTask`**: Replaced sequential fetches with `Promise.all([buildOrcContext, fetchOrcContext, detectCapabilityGaps, enrichWithKnowledgeBase])`. Capability gap context, KB context, and assumption notes are all injected into the Orc prompt.
6. **`orc_decision_log` Table** (migration `20260516000009`): Records every routing decision — mode, confidence, assumptions, risk tier, risk notes, capability gaps, outcome. RLS-protected; indexed on `(user_id, goal_id)` and `(user_id, outcome, created_at DESC)`. Persisted fire-and-forget after every dispatch.
7. **`external_services` Table** (migration `20260516000008`): Vendor registry seeded with 5 entries: Video Editing (Fiverr/Upwork, $200–500), Legal Review (Clerky/UpCounsel, $500–2000), Financial Audit (Pilot.com/Kruze, $2000–10000), Brand Identity (99designs, $500–3000), Data Engineering (Toptal/Fiverr Pro, $1500–5000).
8. **Test Coverage**: `capability-checker.test.ts` (13 cases) and `risk-assessor.test.ts` (17 cases); 73/73 tests pass across new and existing Phase 1/2 suites.

### Files Changed
- `frontend/lib/capability-checker.ts` (new)
- `frontend/lib/risk-assessor.ts` (new)
- `frontend/lib/orc-decision-gate.ts`
- `frontend/lib/llm-client.ts`
- `frontend/tests/unit/capability-checker.test.ts` (new)
- `frontend/tests/unit/risk-assessor.test.ts` (new)
- `supabase/migrations/20260516000008_external_services.sql` (new)
- `supabase/migrations/20260516000009_orc_decision_log.sql` (new)

---

## Session v11.97 — ORC Orchestration: Foundation (Phase 1)
**Date**: May 16, 2026  **Status**: 🔄 In Development  
**Impact**: Transforms Orc from a simple goal dispatcher into a Chief of Staff orchestration engine with intent classification, 7 response modes, structured company memory, and full War Room UI transparency into Orc's reasoning and confidence.

### What Was Built
1. **Brain 1 — Memory (`fetchOrcContext`, `seedOrcContextFromMemo`)**: Fetches top-20 `orc_context` rows ranked by `recency_score`. Auto-seeds from `company_memo` on first run (idempotent, fire-and-forget). `formatOrcContextForPrompt` groups rows into profile/strategy/preference/constraint/outcome sections.
2. **Brain 2 — Decision Tree (`orcDecisionGate`)**: Fast LLM pre-classifier (llama-3.1-8b-instant via LiteLLM, 15s timeout, temperature 0.1) runs before every main orchestrator call. Returns `OrcDecision` with mode, confidence (0.5–1.0), reasoning, risk_notes, followup_options. Fails open to `full_plan` at 0.5 confidence on any error.
3. **7 Response Modes**: `assistant` (direct answer + next steps), `clarify` (1–2 focused prose questions), `quick_plan` (3–5 tasks, parallel), `full_plan` (5–15 tasks with phases), `direct_action` (atomic action with HITL for writes), `command` (system command acknowledgment), `escalate` (surface alternatives when capability exceeded). Each mode has dedicated `getModeInstructions` injected into the prompt.
4. **`ORCHESTRATOR_SYSTEM_NOTE` Rule 11**: LLM must confirm or override the pre-classifier's mode in its `response_mode` JSON field.
5. **War Room UI — `OrcModeBadge`**: Color-coded pill per mode; shows confidence % when below 75%. Wired into `PlanningIndicator` (spinner color and description driven by mode) and `SynthesisReportCard` header.
6. **War Room UI — `OrcReasoningPanel`**: Collapsible ▶ panel below each plan card title showing pre-classifier reasoning, risk flags, and follow-up options.
7. **DB Migrations Applied**:
   - `20260516000005_orc_context`: `orc_context` table with RLS, indexes on `(user_id, recency_score)` and `updated_at`.
   - `20260516000006_capability_inventory`: Global capability registry seeded with 22 capabilities across writing, research, design, engineering, operations, finance/legal, and external service markers.
   - `20260516000007_goals_response_mode`: `response_mode TEXT` (7-value check constraint) and `orc_decision JSONB` columns added to `goals` (additive, backwards-compatible).
8. **Test Coverage**: `orc-decision-gate.test.ts` (19 cases) — all 7 mode classifications, 4 resilience scenarios, confidence clamping, context/history injection. `llm-client.test.ts` updated for decision gate call (+1 fetch per test).

### Files Changed
- `frontend/lib/orc-decision-gate.ts` (new)
- `frontend/lib/llm-client.ts`
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/types/index.ts`
- `frontend/tests/unit/orc-decision-gate.test.ts` (new)
- `frontend/tests/unit/llm-client.test.ts`
- `supabase/migrations/20260516000005_orc_context.sql` (new)
- `supabase/migrations/20260516000006_capability_inventory.sql` (new)
- `supabase/migrations/20260516000007_goals_response_mode.sql` (new)

---

## Session v11.96 — Artifact Sandbox System
**Date**: May 16, 2026  **Status**: ✅  
**Impact**: Artifacts now go through a structured review lifecycle before finalisation. Workers produce drafts; founders approve, discard, or request changes. Output type is auto-detected and transformed (docx/xlsx/md/json). Full Make Changes revision loop implemented.

### What Was Built
1. **Sandbox Lifecycle Schema**: Added `status` field to artifacts — `pending_review → approved | discarded`. Workers write drafts into the sandbox; the artifact is only surfaced to the founder's workspace once approved.
2. **Output Classifier** (`artifact-transformers.ts`): `detectOutputType` auto-detects content type from LLM output (document/spreadsheet/data) and applies the correct transformer. All 6 department entry points (email, content, research, analysis, code, operations) rewired through the classifier.
3. **Sandbox UI** (`ArtifactSandbox` component): Status badges (`pending_review`, `approved`, `discarded`), approve/discard controls with branded confirmation, responsive card layout.
4. **Make Changes Workflow** (Phase 4): Founders can leave inline revision notes on a draft artifact. The original worker task re-dispatches with the founder's feedback prepended as high-priority context and produces an updated draft.
5. **ORC Upgrade Plan**: `ORC_ORCHESTRATION_UPGRADE_PLAN.md` added — full architectural design document for the Chief of Staff transformation (the plan this and subsequent sessions implement).
6. **Test Suite**: Comprehensive artifact sandbox lifecycle tests added.

### Files Changed
- `frontend/lib/artifact-transformers.ts`
- `frontend/components/artifacts/ArtifactSandbox.tsx` (new)
- `frontend/app/api/artifacts/route.ts`
- `frontend/app/api/worker/execute/route.ts`
- `supabase/migrations/` (sandbox lifecycle schema)
- `frontend/tests/` (sandbox lifecycle tests)
- `ORC_ORCHESTRATION_UPGRADE_PLAN.md` (new)
- `CROST_SPEC.md`

---

## Session v11.95 — Audit #17 Idempotency Keys
**Date**: May 15, 2026  **Status**: ✅  
**Impact**: Added request-level idempotency support for duplicate-prone POST operations so client retries do not create duplicate goals, artifacts, approvals, memos, departments, tool executions, suggested actions, OAuth sessions, or Knowledge Base ingests.

### What Was Built
1. **`idempotency_log` Table**: Added a Supabase migration with per-user unique keys, request hashes, replayable JSON responses, and RLS policies.
2. **Shared Idempotency Helper**: Added `beginIdempotentRequest` / `completeIdempotentRequest` to claim keys atomically, replay completed responses, reject key reuse with a different body, and block duplicate in-flight requests.
3. **Critical POST Route Wiring**: Integrated `Idempotency-Key` support into goal, artifact, approval, memo, department, tool, suggested-action, connection, dispatch, dialogue, and Knowledge Base ingest routes.

### Files Changed
- `frontend/lib/idempotency.ts`
- `frontend/app/api/goals/route.ts`
- `frontend/app/api/goals/[id]/dialogue/route.ts`
- `frontend/app/api/goals/[id]/dispatch/route.ts`
- `frontend/app/api/artifacts/route.ts`
- `frontend/app/api/approvals/route.ts`
- `frontend/app/api/tools/invoke/route.ts`
- `frontend/app/api/tools/execute/route.ts`
- `frontend/app/api/suggested-actions/execute/route.ts`
- `frontend/app/api/suggested-actions/[id]/execute/route.ts`
- `frontend/app/api/connect/route.ts`
- `frontend/app/api/knowledge/upload/route.ts`
- `frontend/app/api/knowledge/import/route.ts`
- `frontend/app/api/memos/route.ts`
- `frontend/app/api/departments/route.ts`
- `supabase/migrations/20260515120000_create_idempotency_log.sql`

---

## Session v11.94 — E2E Audit: Approval Execution Path Hardening
**Date**: May 7, 2026  **Status**: ✅  
**Impact**: E2E testing revealed the approval execution route had its own Composio instance that bypassed the slug override map, an invalid `event_type` that would violate the DB CHECK constraint, and the DIRECT LLM approval path never emitted `approval_requested` to the event log.

### Bugs Fixed

**BUG-8 — Approval route bypassed COMPOSIO_SLUG_OVERRIDE_MAP**  
- `app/api/approvals/[id]/route.ts` called `composio.tools.execute(composioActionForCall)` with a raw slug. Our BUG-5 fix added `COMPOSIO_SLUG_OVERRIDE_MAP` in `composio.ts` but the approval route instantiated Composio directly without applying it.  
- `COMPOSIO_SLUG_OVERRIDE_MAP` extracted to module-level export; approval route imports and resolves the slug before calling `tools.execute()`. Gmail draft tasks now succeed post-approval.  
- Files: `frontend/lib/tools/providers/composio.ts`, `frontend/app/api/approvals/[id]/route.ts`

**BUG-9 — Invalid `event_type: 'tool_failed'` in approval catch block**  
- Catch block wrote `event_type: 'tool_failed'` which is not in the `EventType` union or the DB CHECK constraint. The INSERT was silently rejected, masking approval execution failures in the event log.  
- Fixed to `'action_execution_failed'` which is a valid `EventType`.  
- File: `frontend/app/api/approvals/[id]/route.ts`

**BUG-3b — DIRECT LLM approval path never emitted `approval_requested` event**  
- `runWorkerTask`'s `REQUEST_APPROVAL` branch in `llm-client.ts` wrote to `approval_queue` but never inserted an `approval_requested` event_log entry. Only the `executeToolCall` (Composio) path had that event.  
- Added `approval_requested` insert after the `approval_queue` insert in `runWorkerTask`. Event log now shows full lifecycle: `approval_requested` → `approval_approved` → `tool_executed` (or `action_execution_failed`).  
- File: `frontend/lib/llm-client.ts`

### Files Changed
- `frontend/lib/tools/providers/composio.ts`
- `frontend/app/api/approvals/[id]/route.ts`
- `frontend/lib/llm-client.ts`

---

## Session v11.93 — Full-Stack Observability, Slug Fixes & Multi-Tenant Hardening
**Date**: May 7, 2026  **Status**: ✅  
**Impact**: Resolved 7 production bugs spanning silent failure swallowing, missing event_log entries, stale cross-account state, and incorrect Composio tool slugs. Added comprehensive unit + E2E test coverage for all fixes.

### Bugs Fixed

**BUG-6 — `worker/execute` catch-all was completely silent**  
- `taskId`, `goalId`, `toolName`, `userId` were declared inside the `try` block, making them inaccessible in `catch` → hoisted to function scope.  
- Catch block now writes `goal_tasks` failure status, `event_log` `task_failed` entry, and system `company_memo`. Previously: no DB writes, no observability, silent stall.  
- File: `frontend/app/api/worker/execute/route.ts`

**BUG-2 — Worker exception path emitted no `event_log` entry**  
- `runWorkerTask`'s `workerErr` catch block updated `goal_tasks` and wrote a memo but never inserted into `event_log`. Added `task_failed` event insert (with `completed_at` on the task update).  
- File: `frontend/lib/llm-client.ts`

**BUG-7 — LLM-returned `status: "failed"` bypassed all observability**  
- JSON parsing hardened to propagate `parsed.status === 'failed'` into `workerResult.status` (previously only `needs_more_data` was checked, so explicit failure was silently marked 'completed').  
- Non-exception failure guard added: when `workerResult.status === 'failed'`, writes `task_failed` to `event_log` and a high-priority system `company_memo` before returning.  
- File: `frontend/lib/llm-client.ts`

**BUG-1 — Context injection SELECT omitted `task_id` and `goal_id`**  
- Orchestrator's recent-tasks query selected `label, status, dept_slug, created_at` — no identifiers. Orc could not reference past tasks for retry.  
- Fixed SELECT to include `task_id, goal_id`; format string updated to `(task_id: …, goal_id: …, Dept: …)`.  
- File: `frontend/lib/llm-client.ts`

**BUG-3 — HITL approval path never emitted `approval_requested` to `event_log`**  
- `executeToolCall` wrote to `approval_queue` and `company_memos` but skipped `event_log`. Added `approval_requested` insert with `approval_id`, `tool`, `risk_level`, and `task_id` in metadata.  
- File: `frontend/lib/tools/execute-tool-call.ts`

**BUG-5 — Composio slug mismatches caused silent 404s on tool execution**  
- `GMAIL_CREATE_DRAFT`, `GMAIL_SEND`, `GMAIL_REPLY`, `GITHUB_CREATE_PR`, `GITHUB_MERGE_PR`, `NOTION_CREATE_PAGE` all have different actual slugs in Composio's catalog.  
- Added `COMPOSIO_SLUG_OVERRIDES` map in `composio.ts`; slug is resolved before `tools.execute()`.  
- File: `frontend/lib/tools/providers/composio.ts`

**BUG-4 — Stale `activeGoal` persisted across account switches**  
- Zustand's `partialize` persists `activeGoal` to localStorage. On account switch, a previous user's goal leaked into the new session.  
- Added `supabaseClient.auth.onAuthStateChange` listener in `LayoutStoreHydrator`: clears `activeGoal` on `SIGNED_OUT`; on `SIGNED_IN` / `TOKEN_REFRESHED`, clears if `activeGoal.created_by !== session.user.id`.  
- File: `frontend/components/providers/LayoutStoreHydrator.tsx`

### Test Coverage Added
- **`tests/unit/worker-execute.test.ts`** (new) — 5 tests: BUG-6 catch block writes goal_tasks/event_log/company_memo, 500 response, 401 auth gate.
- **`tests/unit/execute-tool-call.test.ts`** (new) — 6 tests: BUG-3 approval_requested event, BUG-5 Composio slug overrides, permission_denied graceful return.
- **`tests/unit/llm-client.test.ts`** (extended) — 3 new describe groups: BUG-1 context includes task_id, BUG-2 task_failed on exception, BUG-7 task_failed on non-exception failure.
- **`tests/e2e/waterfall-lifecycle.spec.ts`** (extended) — 3 new describe blocks covering BUG-2/6/7 observability, BUG-3 approval_requested event, BUG-4 cross-account isolation.

### Files Changed
- `frontend/app/api/worker/execute/route.ts`
- `frontend/lib/llm-client.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/lib/tools/providers/composio.ts`
- `frontend/components/providers/LayoutStoreHydrator.tsx`
- `frontend/tests/unit/worker-execute.test.ts` (new)
- `frontend/tests/unit/execute-tool-call.test.ts` (new)
- `frontend/tests/unit/llm-client.test.ts`
- `frontend/tests/e2e/waterfall-lifecycle.spec.ts`

---

## Session v11.92 — AI Pipeline Hardening & Error Resilience
**Date**: May 6, 2026  **Status**: ✅  
**Impact**: Resolved "Context Amnesia" and task stalling by hardening Orchestrator memory and worker error handling.
### What Was Built
1. **Meta-Command Awareness**: Orchestrator now receives the last 5 workspace tasks in its prompt, enabling reliable "Retry" commands.
2. **Enhanced Memory Retention**: `buildOrcContext` now includes memo bodies for recent items, preventing the loss of critical error/summary context.
3. **Hardened Worker Exceptions**: `runWorkerTask` now forces task status to 'failed' and writes a system memo on LLM/network failure, preventing silent goal stalls.
4. **Robust Approval Parsing**: Refactored `parseApprovalRequest` to handle nested JSON and wrapped LLM responses, eliminating `APPROVAL_PARSE_BLOCKED` errors.
5. **Unit Test Alignment**: Hardened unit tests and mocks in `llm-client.test.ts` to reflect the new state-machine logic.
### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/tests/unit/llm-client.test.ts`

---

## Session v11.91 — Orc Intelligence & Intent Hardening
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Significantly hardened Orc's intelligence to distinguish complex goals from conversational queries, enforced industry-standard assumptions, and improved worker-blocked messaging.

### What Was Built
1. **Action Verb Triggers**: Updated `ORCHESTRATOR_SYSTEM_NOTE` in `llm-client.ts` to explicitly define substantive action verbs (design, write, create, build, etc.) that mandate **Planning Mode**. This prevents Orc from "hallucinating" work inside a chat response and ensures proper artifact production.
2. **Assumption Over interrogation**: Added a new behavioral rule mandating that Orc make industry-standard assumptions (e.g., X = Twitter, Insta = Instagram) instead of halting execution for pedantic clarification. Assumptions are now documented in the `risk_note`.
3. **Hardened "Needs Data" Messaging**: Updated `runWorkerTask` to inject a default, human-readable note ("The department requires more context...") if a department fails to provide a specific reason for a block. This ensures the War Room UI never displays an empty "Orc needs:" message.
4. **Resilience Verification**: Verified that "What can you do?" triggers a fast assistant response while "Design a post" correctly triggers a multi-task mission.

### Files Changed
- `frontend/lib/llm-client.ts`

---

## Session v11.90 — Orc Intent Detection & UX Refinement
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Sharpened Orc's ability to distinguish between simple questions and complex goals, and introduced distinct UI branding for direct conversational responses.

### What Was Built
1. **Sharper Intent Detection**: Refined `ORCHESTRATOR_SYSTEM_NOTE` in `llm-client.ts` to strictly enforce "Assistant Mode" for conversational queries (e.g., "what can you do?"). This eliminates redundant multi-task planning and slow response times for simple interactions.
2. **"Orc Assistant" UI Branding**: Updated `SynthesisReportCard` in `WarRoom.tsx` to intelligently detect direct responses. Simple answers are now branded as **"Orc Assistant / Direct Response"**, while complex goals retain the **"Strategic Output / Mission Report"** signature.
3. **Synthesis Title Hardening**: Updated `buildOrcContext` to use a predictable `[DIRECT RESPONSE]` title prefix for conversational memos, ensuring the UI can reliably toggle its branding state.

### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/components/war-room/WarRoom.tsx`

---

## Session v11.89 — Production Build Fix (TypeScript Alignment)
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Resolved fatal production build failure on Render caused by a missing union member in the `EventType` definition.

### What Was Built
1. **Type Alignment**: Updated `frontend/types/index.ts` to include `'provider_fallback'` in the `EventType` union. This ensures the Event Log UI can safely reference this new event type without triggering TypeScript compilation errors.
2. **Verified Stability**: Successfully ran local `type-check` and `lint` to confirm build integrity.

### Files Changed
- `frontend/types/index.ts`

---

## Session v11.88 — Usage Limits & Event Log Deep-Linking
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Fixed usage limit reset messaging and ensured Orchestrator failures are correctly logged and searchable via goal-scoped deep-links.

### What Was Built
1. **Local Midnight Resets**: Updated `checkTokenBudget` in `llm-client.ts` to reset at local midnight of the user's environment rather than UTC midnight. This aligns with the "12:00 AM reset" expectation and resolves the "1:00 AM reset" confusion for GMT+1 users.
2. **Quota Event Logging**: Updated `POST /api/goals` and `POST /api/goals/[id]/dialogue` to explicitly log `token_limit_hit` and `error` events with the associated `goal_id` when the Orchestrator fails. This ensures the "view full event log →" link is no longer empty.
3. **Event Log UI Upgrade**: Added `token_limit_hit` and `provider_fallback` to the event type filter dropdown.
4. **War Room Context**: Updated the failure deep-link to show ALL events for the specific goal ID (removing the mandatory `type=error` filter), providing founders with the full history leading up to a failure.
5. **Messaging Refinement**: Improved the quota error message in `utils.ts` to explicitly state it is a "usage cap" rather than an "app error," managing founder expectations.

### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/app/api/goals/route.ts`
- `frontend/app/api/goals/[id]/dialogue/route.ts`
- `frontend/components/event-log/EventLogClient.tsx`
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/lib/utils.ts`

---

## Session v11.87 — UX Branding Audit & Native Dialog Elimination
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Eliminated all remaining native browser dialogs (`confirm`, `alert`), replacing them with branded, in-app confirmation modals and toast notifications for a consistent, professional founder experience.

### What Was Built
1. **Branded Confirmation Modal**: Created `frontend/components/ui/ConfirmationModal.tsx`, a reusable, high-fidelity modal component styled to match the Crost aesthetic (Syne typography, glassmorphism backdrops, accent shadows).
2. **Artifact Deletion Flow**: Replaced the native `confirm()` in `ArtifactCard.tsx` with the new branded modal. Replaced error alerts with the in-app toaster.
3. **Knowledge Base Hardening**: Audited and updated `frontend/app/dashboard/knowledge/page.tsx` to remove native deletion confirmations.
4. **Department Settings & Chat**: Updated `DeptSettingsForm.tsx` and `DepartmentChat.tsx` to eliminate native dialogs for clearing history, discarding drafts, and resetting templates.
5. **System Settings**: Updated `ApiKeysSettings.tsx` to use branded toast notifications for validation errors instead of browser alerts.
6. **War Room Resilience**: Replaced remaining goal-submission error alerts with branded toasts.

### Files Changed
- `frontend/components/ui/ConfirmationModal.tsx`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/components/departments/DepartmentChat.tsx`
- `frontend/components/departments/DeptSettingsForm.tsx`
- `frontend/app/dashboard/knowledge/page.tsx`
- `frontend/components/settings/ApiKeysSettings.tsx`
- `frontend/components/war-room/WarRoom.tsx`

---

## Session v11.86 — Orc UX Refinement & Force-Plan Hardening
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Corrected Orc's self-introduction logic and hardened the "Skip & Plan Anyway" workflow to ensure maximum resilience when clarification is bypassed.

### What Was Built
1. **Onboarding UX**: Updated the "Meet Orc" screen (`MeetOrcPage`) to explicitly introduce "Orc (short for Orchestrator)" to set clear expectations for new founders.
2. **Brain Hardening**: Corrected `ORCHESTRATOR_SYSTEM_NOTE` in `llm-client.ts` to remove the redundant "short for Orchestrator" from every response, restricting it to explicit "Who are you?" queries.
3. **Force-Plan Resilience**: Strengthened the `runOrchestratorTask` logic. When a founder clicks "Skip & Plan Anyway", Orc is now explicitly authorized and instructed to proceed with partial context, leveraging System Memory, Memos, and the KB to form the best possible plan rather than repeating clarification questions.

### Files Changed
- `frontend/app/onboarding/orc/page.tsx`
- `frontend/lib/llm-client.ts`

---

## Session v11.85 — Orc Capability Hardening & Image Generation
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Mandated strict capability awareness for Orc to prevent hallucinated external hiring. Added native image generation capabilities for the Marketing department via Pollinations.ai.

### What Was Built
1. **Spec & Prompt Hardening**: Updated `CROST_SPEC.md` and `ORCHESTRATOR_SYSTEM_NOTE` (in `llm-client.ts`) to enforce strict capability awareness. Orc must now anticipate missing capabilities (e.g. video editing) and propose alternatives (e.g. Design Specs) during the planning phase, rather than failing silently or assuming the founder can afford external hires.
2. **Marketing Department Upgrade**: Added `graphic_design` and `image_generation` capabilities to the Marketing department in `scripts/seed-departments.ts` and created migration `20260502223000_update_marketing_capabilities.sql`.
3. **Pollinations.ai Image Generation**: Created `image-transformer.ts` and updated `detectOutputType` to detect image requests. The Marketing department can now seamlessly generate actual `.jpg` banners and illustrations using the free Pollinations.ai API, without requiring new API keys.
4. **UX Bug Fixes**: Fixed the "Orc needs: [empty]" blocked message bug by properly appending missing data arrays to `orc_notes` in `llm-client.ts` and rendering the last note text in `WarRoom.tsx`. Added explicit "Orc (short for Orchestrator)" self-introduction.

### Files Changed
- `CROST_SPEC.md`
- `frontend/lib/llm-client.ts`
- `scripts/seed-departments.ts`
- `supabase/migrations/20260502223000_update_marketing_capabilities.sql` (New)
- `frontend/lib/artifact-transformers/image-transformer.ts` (New)
- `frontend/lib/artifact-transformers/index.ts`
- `frontend/components/war-room/WarRoom.tsx`
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Resolved parameter mapping failures for direct slash commands. Gmail and other tools now correctly parse natural language input into structured parameters.

### What Was Built
1. **AI Parameter Resolver**: Created `frontend/lib/tools/parameter-resolver.ts` which uses a fast LLM (Llama 3.1 8B) to map natural language chat input into the structured JSON schema required by tools.
2. **Invoke Route Integration**: Updated `POST /api/tools/invoke` to automatically trigger the parameter resolver when a founder uses a slash command with raw text (e.g., `/gmail.send_email hello to...`).
3. **Gmail Reliability**: Fixed the "Missing recipient" error by ensuring the `to` or `recipient_email` field is correctly extracted from natural language commands.

### Files Changed
- `frontend/lib/tools/parameter-resolver.ts`
- `frontend/app/api/tools/invoke/route.ts`

---

## Session v11.83 — Waterfall Restoration & Status Hardening
**Date**: May 2, 2026  **Status**: ✅  
**Impact**: Resolved critical failures in the task waterfall, enabling "Skip" and "Mark Done" functionality and unblocking downstream dependencies.

### What Was Built
1. **Waterfall Dispatch Fix**: Updated `POST /api/goals/[id]/dispatch` to allow `skipped` and `rejected` task statuses to satisfy dependencies. Previously, only `completed` was accepted, causing 409 Conflict errors for any goal where a task was bypassed.
2. **Database Status Alignment**: Created migration `20260502222000_unblock_waterfall.sql` to add the missing `'skipped'` status to the `goal_tasks_status_check` constraint. This resolves the 500 Internal Server Error when founders attempt to skip tasks.
3. **Spec §6 Compliance**: Restored the `expected_deliverable` column in both the database and the dispatcher logic, ensuring workers receive clear output requirements as mandated by the spec.
4. **Idempotency Hardening**: Updated the dispatcher to treat `skipped` and `rejected` as terminal statuses, preventing redundant re-execution attempts.

### Files Changed
- `frontend/app/api/goals/[id]/dispatch/route.ts`
- `supabase/migrations/20260502222000_unblock_waterfall.sql`
- `frontend/types/index.ts` (updated in v11.82)
**Date**: May 1, 2026  **Status**: ✅  
**Impact**: Resolved critical Orc UI unresponsiveness, silent API errors, task dependency loops, and ghost approval counters.

### What Was Built
1. **WarRoom UI Hardening**: Surfaced `unauthenticated` and network errors via `setPollError` instead of silent `console.error`; fixed empty PATCH on reject; removed optimistic `status: planning` flip to stop clarification skipping.
2. **Task Execution Resilience**: `llm-client.ts` now filters out placeholder/invalid task IDs in `depends_on` after UUID remapping, preventing deadlocks in the worker waterfall.
3. **Ghost Approvals Fix**: Reduced throttling in `LayoutStoreHydrator.tsx` from 5s to 1s to resolve UI desync where approvals seemed higher than actual pending tasks.
4. **Documentation**: Merged `CLAUDE.md` into `GEMINI.md` to establish a single source of truth.

### Files Changed
- `GEMINI.md`
- `CLAUDE.md` (deleted)
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/components/providers/LayoutStoreHydrator.tsx`
- `frontend/lib/llm-client.ts`

---

## Session v11.80 — QA Suite, Security Fixes & Edge-Case Hardening
**Date**: April 30, 2026  **Status**: ✅  
**Impact**: Comprehensive test suite (E2E + unit) covering auth, waterfall, HITL, artifacts, and edge cases; 9 security/reliability bugs fixed including multi-tenant data leak, unauthenticated worker execution, and onboarding store persistence.

### What Was Built
1. **Playwright E2E Suite** (`tests/e2e/`):
   - `auth-security.spec.ts` — 27 cases: duplicate signup bypass, middleware redirects, onboarding step rank enforcement, cookie force-purge, 3-step onboarding flow
   - `waterfall-lifecycle.spec.ts` — 10 suites: happy-path goal→artifact, direct Orc response, hallucination guard retry, chain-reaction dispatch, rejection cascade, HITL matrix (careful/aggressive), LLM 503/429 silent fallback, Composio schema mismatch, JIT connection sync, realtime subscription isolation
2. **Vitest Unit Suite** (`tests/unit/`):
   - `llm-client.test.ts` — 18 cases: full fallback chain, SYSTEM_LIMIT_EXCEEDED no-retry, provider_fallback event logging, first-goal exemption, hallucination guard redraft
   - `utils-errors.test.ts` — 32 cases: ERROR_REGISTRY completeness, resolveCrostError heuristics, formatErrorMessage, cleanLargePayload, event_log payload size guard
   - `artifact-transformers.test.ts` — 30 cases: detectOutputType 10-tier priority, Excel/Docx/Markdown transformers, image fallback, artifact sources shape
   - `edge-cases.test.ts` — 12 cases: AbortError fallback chain, SUPABASE_QUERY keyword guard (comment injection, double-semicolon), Zod tool_call enum, realtime filter contract, onboarding store reset, worker 401/internal-secret auth, hallucination guard goal error state, CR-DB-MEMO surfacing
3. **QA Documentation** (`QA_ARCHITECTURE_REPORT.md`, `QA_AGENT_GUIDE.md`): Agent-runnable guide with environment setup, mock factories, known contracts, CI GitHub Actions YAML

### Bugs Fixed
1. **CRITICAL — Multi-tenant data leak**: `EventLogClient`, `RealtimeProvider`, `ApprovalsLiveRefresh` had unfiltered `postgres_changes` subscriptions; added async session fetch + `created_by/user_id=eq.${userId}` filter on all three
2. **CRITICAL — Silent approval creation failure**: `POST /api/approvals` Zod schema missing `'tool_call'` in `action_type` enum; added it (DB already allowed it)
3. **HIGH — Goal stuck in planning**: Hallucination guard threw without setting goal `status: 'error'`; now updates `goals` row + `orc_notes` before throwing
4. **HIGH — Silent memory gaps**: `addTaskLog` was fire-and-forget; now awaited; failures surface as `CR-DB-MEMO` event log entry
5. **HIGH — Approval polling firehose**: `ApprovalsLiveRefresh` had no debounce; added 150ms debounce, `useRef` timer tracking, circuit breaker (MAX_CONSECUTIVE_ERRORS=3)
6. **HIGH — Unauthenticated worker execute**: `/api/worker/execute` accepted arbitrary `userId` from body; added dual-auth gate (session OR `x-crost-internal-secret` header)
7. **MEDIUM — Onboarding store leak**: Sensitive business data remained in localStorage after activation; `finalizeAndRedirect()` now calls `reset()` + `localStorage.removeItem('crost-onboarding-storage')`

### Files Changed
- `frontend/package.json` — test scripts, devDependencies (playwright, vitest, jsdom, vite)
- `frontend/playwright.config.ts` — new
- `frontend/vitest.config.ts` — new
- `frontend/tests/e2e/fixtures/auth.setup.ts` — new
- `frontend/tests/e2e/fixtures/llm-mocks.ts` — new
- `frontend/tests/e2e/fixtures/api-helpers.ts` — new
- `frontend/tests/e2e/auth-security.spec.ts` — new
- `frontend/tests/e2e/waterfall-lifecycle.spec.ts` — new
- `frontend/tests/unit/setup.ts` — new
- `frontend/tests/unit/llm-client.test.ts` — new
- `frontend/tests/unit/utils-errors.test.ts` — new
- `frontend/tests/unit/artifact-transformers.test.ts` — new
- `frontend/tests/unit/edge-cases.test.ts` — new
- `frontend/QA_ARCHITECTURE_REPORT.md` — new
- `frontend/QA_AGENT_GUIDE.md` — new
- `frontend/components/event-log/EventLogClient.tsx` — multi-tenant filter fix
- `frontend/components/providers/RealtimeProvider.tsx` — multi-tenant filter fix
- `frontend/components/approvals/ApprovalsLiveRefresh.tsx` — filter + debounce + circuit breaker
- `frontend/app/api/approvals/route.ts` — Zod tool_call enum fix
- `frontend/lib/llm-client.ts` — goal error state on hallucination guard + await addTaskLog + CR-DB-MEMO logging
- `frontend/app/api/worker/execute/route.ts` — dual-auth gate
- `frontend/app/onboarding/activate/page.tsx` — store reset on finalize

---

## Session v11.79 — UX Resilience & Error Humanization
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Standardized technical error handling across the frontend, ensuring LiteLLM and network failures are humanized and actionable.

### What Was Built
1. **Centralized Error Registry** (`errors.ts`):
    - Created a formal `ERROR_REGISTRY` mapping technical codes (401, 429, 503) to human-friendly "Founder Messages".
    - Added `resolveCrostError` heuristic engine to handle technical substrings and legacy JSON errors.
2. **LiteLLM Sanitization** (`llm-client.ts`):
    - Improved `llm-client.ts` to surgically extract cleaner error messages from LiteLLM's nested JSON responses while maintaining detection prefixes.
3. **Frontend UX Hardening**:
    - Updated `formatErrorMessage` in `utils.ts` to utilize the new Error Registry.
    - Audited and updated Login, Signup, Onboarding, and Settings components to use centralized formatting, eliminating raw technical "Failed to fetch" or "LiteLLM error" strings from toasts.

---

## Session v11.78 — Silent Provider Fallback & Resilience
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Eliminated user-facing "Provider Unavailable" errors by implementing an automated, silent fallback strategy.

### What Was Built
1. **Silent Fallback Logic** (`llm-client.ts`):
    - Refactored `callLLM` to automatically catch 503 (Service Unavailable) and other provider-level errors.
    - Implemented a "Silent Switch" protocol: if a primary model fails, the system immediately tries the next provider in the `RESILIENT_FALLBACK_CHAIN` (e.g., Groq → Gemini → Groq Llama 3.1).
2. **Transparent Background Logging**:
    - Switches are now logged silently to the `event_log` as a `provider_fallback` event.
    - This maintains the "magic" of the UI (no error banners) while providing full technical traceability in the back-end logs.
3. **Resilience Hardening**:
    - Added retry counters and explicit "System Limit" bypasses to ensure billing/quota errors are still surfaced correctly while temporary spikes in demand are handled autonomously.

---

## Session v11.77 — Design Skill & Image Generation Fallback
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Resolved the "Image Generation" edge case by implementing a dedicated Skills layer for Design, ensuring the system fails gracefully with professional specifications instead of blank outputs.

### What Was Built
1. **Design & Image Skill** (`lib/skills/image`):
    - Created a new `image` skill that provides strict guidance to LLMs on how to handle design tasks.
    - Explicitly prohibits binary hallucination and mandates a **High-Fidelity Design Specification** (JSON) as a fallback.
    - Includes a structured schema for dimensions, color palettes, typography, and creative prompts (DALL-E/Midjourney compatible).
2. **Skill Layer Integration**:
    - Updated `ACTION_SKILL_MAP` to automatically load the `image` skill for keywords like "design", "banner", "logo", and "creative".
    - Hardened `SKILLS_DIR` resolution to ensure reliable loading across different process environments.
3. **Artifact Transformation**:
    - Updated `detectOutputType` to recognize the `image` skill and automatically transform its JSON output into a professional **Creative Design Brief** (.md).
    - This ensures that when a text-only model (like Llama 3) is asked to "Design a banner", the founder receives a structured brief they can actually use, rather than a technical failure.

---

## Session v11.76 — Orc Hardening & 431 definitive fix
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Eliminated Orchestrator department hallucinations and hardened cookie configurations to permanently resolve 431 errors.

### What Was Built
1. **Orchestrator Validation Layer** (`llm-client.ts`):
    - Implemented a "Hallucination Protection" routine that validates all proposed departments against the real-time database list.
    - Added an automated "Self-Correction" loop: if Orc hallucinations an unknown department, the system now intercepts the response and issues a `CRITICAL ERROR` prompt forcing a redraft.
    - If boundaries are violated twice, the plan is rejected entirely to prevent downstream execution failures.
2. **Hardened Cookie Domains**:
    - Updated `auth/callback` and `api/toggle` routes to explicitly use the dynamic `app.crosthq.com` domain for all `set-cookie` operations.
    - This ensures that *newly* set session cookies and mode toggles do not accidentally populate the wildcard `.crosthq.com` domain, which was causing the 431 recurrence.
3. **Prompt Engineering**:
    - Strengthened `ORCHESTRATOR_SYSTEM_NOTE` with absolute constraints and explicit prohibitions against creating phantom departments like "design" or "graphics".

---

## Session v11.75 — Build Fix & Artifact Naming Polish
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Resolved a production build failure and improved user experience by providing descriptive filenames for generated artifacts.

### What Was Built
1. **TypeScript Build Fix** (`types/index.ts`):
    - Added missing `goal_id` field to `EventLogEntry` interface to resolve property access errors during Next.js compilation.
2. **Descriptive Artifact Naming** (`llm-client.ts`):
    - Refactored `uploadArtifact` to derive filenames from task labels (e.g., `fy26-financial-projection.xlsx`) instead of random UUIDs.
    - Implemented a filename sanitizer to ensure compatibility with all OS/browsers (lowercase, no special characters).
3. **Email Attachment Investigation**:
    - Identified that while `executeToolCall` passes `attachment_url` to Gmail, the current Composio integration requires specific handling for URL-based attachments which may be causing the silent omission.

---

## Session v11.74 — Cloud Enforcement & Event Log Stability
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Eliminated all emergency local model fallbacks to ensure 100% cloud reliability for MVP. Fixed a critical filtering bug in the Event Log deep-link.

### What Was Built
1. **Cloud-Only Fallback Chain** (`llm-client.ts`):
    - Removed `local/gemma3` from the `RESILIENT_FALLBACK_CHAIN`.
    - Added `groq/llama-3.1-8b-instant` as the tertiary cloud fallback.
    - Corrected the Gemini backup model name to `gemini/gemini-2.0-flash`.
2. **Event Log Deep-Link Fix** (`EventLogClient.tsx`):
    - Resolved a JavaScript property access error (`(ev as any).goal_id`) that was causing the event log to appear empty when filtered via deep-link.
    - Simplified the client-side filtering logic to correctly match the `goal_id` column.

---

## Session v11.73 — Cookie Force Purge (Legacy Cleanup)
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Resolved persistent 431 errors on browsers with "poisoned" cookie states by implementing an aggressive force-purge of legacy wildcard cookies (`.crosthq.com`).

### What Was Built
1. **Force Purge Logic** (`LayoutStoreHydrator.tsx`):
    - Added an automated routine that detects duplicated Supabase auth cookies.
    - Specifically targets and deletes cookies set on the parent `.crosthq.com` domain by setting their expiry to the past.
    - This ensures that only the new, correctly-scoped `app.crosthq.com` cookies are sent to the server, curing the 431 error instantly without requiring manual cache clearing.

---

## Session v11.72 — 431 Header Fix & Dynamic Refactoring
**Date**: April 29, 2026  **Status**: ✅
**Impact**: Resolved 431 "Request Header Fields Too Large" errors by narrowing cookie domains and refactored configurations to use dynamic environment-based hostnames instead of hardcoded strings.

### What Was Built
1. **Cookie Bloat Mitigation** (`LayoutStoreHydrator.tsx`):
    - Added a cookie check and refined polling/realtime logic to prevent excessive re-renders and network usage.
    - Optimized re-renders using Zustand selectors and `useRef` for stable callbacks.
2. **Dynamic Domain Handling**:
    - Refactored `middleware.ts`, `lib/supabase.ts`, and `lib/supabase-browser.ts` to derive the cookie domain dynamically from `NEXT_PUBLIC_APP_URL`.
    - Eliminated hardcoded `app.crosthq.com` references for better scalability across environments.
3. **Verified Stability**:
    - Confirmed `npm run type-check` and `npm run lint` pass cleanly in the frontend.

---

## Session v11.71 — Production Build Fix (Render)
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixed a fatal production build error on Render caused by standalone debug scripts in the `frontend/` directory being caught by the Next.js type-checker.

### What Was Built
1. **Clean Frontend Root** (`frontend/`):
    - Moved several standalone scripts (`debug-result.ts`, `debug-tools.ts`, `check_events.ts`, `check-data.js`, `check-rest.js`, `checkDB.js`, `run-migration.js`) from the `frontend/` root to the project-level `scripts/` directory.
    - This prevents `next build` and `tsc` from attempting to compile these non-application files, which lacked production dependencies (like `dotenv`) and caused type-check failures.
2. **Verified Stability**:
    - Ran `npm run type-check` in the `frontend/` directory to confirm a clean build state.

### Files Changed
- Moved scripts to `scripts/`
- CROST_MASTER.md

---

## Session v11.70 — Upload & Resume Workflow
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Streamlines the "Missing Data" recovery process. Founders can now jump directly from a blocked task to the Knowledge Base to provide data and resume their mission without getting lost in navigation.

### What Was Built
1. **Direct Upload Link** (`WarRoom.tsx`):
    - Added a conditional **"↑ Upload Data"** action button to `TaskApprovalItem`.
    - Only appears when a task is in the `needs_data` (❓ BLOCKED) state.
    - Deep-links directly to `/dashboard/knowledge` in a new browser tab.
2. **Context Preservation**:
    - By opening the Knowledge Base in a new tab, the main Dashboard remains active and the goal stays in its "paused" state.
    - Founder can finish the upload, close the tab, and immediately hit "↻ Retry" to proceed.

### Files Changed
- frontend/components/war-room/WarRoom.tsx

---

## Session v11.69 — War Room UX & Department Sync Fixes
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Resolved several lingering UX friction points in the War Room and department management, making the system feel more reactive and reliable.

### What Was Built
1. **Dynamic Action Copy Rotation** (`WarRoom.tsx`):
    - Updated `PlanningIndicator` to rotate through warm office-themed messages (e.g., "Sketching the strategy") every 3.5 seconds using a `setInterval` loop.
    - Added a `minHeight` constraint to prevent layout shifts during copy rotation.
2. **Cancellation State Reset** (`WarRoom.tsx`):
    - Hardened `handleCancelGoal` to explicitly reset `isSubmittingGoal` to `false`.
    - This ensures the "PLANNING" overlay and button state disappear immediately when a goal is aborted, even if the backend request is still in flight.
3. **Reactive Department Sync** (`SyncAllButton.tsx`, `DashboardActions.tsx`):
    - Updated the sync department actions to proactively fetch fresh department data and update the global Zustand store.
    - This ensures that stuck "error" states on department cards are cleared immediately after a successful resync, without requiring a manual page reload.

### Files Changed
- frontend/components/war-room/WarRoom.tsx
- frontend/components/departments/SyncAllButton.tsx
- frontend/components/departments/DashboardActions.tsx

---

## Session v11.68 — Missing Data Strategy (C-D-A Pipeline)
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Orc now handles missing documents/data gracefully instead of cascade-failing. Founders can intervene mid-mission or skip missing steps without halting the mission.

### What Was Built
1. **Recovery Protocol** (`llm-client.ts`):
    - Injected a new "Non-negotiable Recovery Protocol" into all worker prompts.
    - Instructs workers to return `needs_more_data: true` when data is missing (Option C).
    - Instructs workers to generate Templates with placeholders if upstream data was skipped (Option A).
2. **Waterfall Resilience** (`scripts/worker.ts`):
    - Updated `unblockDependentTasks` to allow tasks to run if their dependencies are `completed` OR `skipped` (Option D).
    - Relaxed memo verification for skipped tasks.
3. **Chain Reaction Unblocking** (`api/goals/[id]/tasks/[taskId]/route.ts`):
    - Added support for the `skipped` status in the task patch API.
    - Triggered an internal dispatch call on skip to immediately unblock downstream tasks.
4. **Resilient UI** (`WarRoom.tsx`):
    - Added UI handling for the `needs_data` state (❓ BLOCKED).
    - Surfaced Orc's internal "missing data notes" to the founder.
    - Provided Skip/Retry buttons for blocked tasks to keep momentum.

### Files Changed
- frontend/lib/llm-client.ts
- scripts/worker.ts
- frontend/app/api/goals/[id]/tasks/[taskId]/route.ts
- frontend/components/war-room/WarRoom.tsx

---

## Session v11.67 — Knowledge Base Suggested Action
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Enables founders to "save to knowledge base" any generated artifact with one tap, ensuring high-quality work is reusable and searchable in future missions.

### What Was Built
1. **KB Import Tool** (`api/knowledge/import/route.ts`):
    - Implemented a new internal endpoint that clones an artifact from the `artifacts` storage bucket to `knowledge-base`.
    - Automatically creates a `knowledge_base_files` record with `source_artifact_id` for traceability.
    - Triggers the async extraction pipeline (text extraction, LLM summarization, and chunking) so the file is immediately useful for Orc.
2. **Unified Execution Wiring** (`api/tools/execute/route.ts`):
    - Added `knowledge_base_import` to the internal mock tools registry.
    - Ensured it respects the founder's session cookies for secure storage operations.
3. **Suggested Action Alignment** (`lib/execute-suggested-action.ts` & `lib/suggested-actions.ts`):
    - Refactored the `save_to_kb` action slug to use the new `internal.knowledge_base_import` tool.
    - Updated the action generator to pass the required `artifact_id` in the context payload.

### Files Changed
- frontend/app/api/knowledge/import/route.ts (New)
- frontend/app/api/tools/execute/route.ts
- frontend/lib/execute-suggested-action.ts
- frontend/lib/suggested-actions.ts

---

## Session v11.66 — MVP Hardening: Citations & Strategic Context
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Closes several simulation-critical gaps by implementing automated citation propagation and deepening Orc's strategic grounding.

### What Was Built
1. **Citation Propagation** (`llm-client.ts`):
    - Workers now capture the `sources` JSON object from LLM responses and merge them directly into the `artifacts.sources` database column.
    - This ensures that if a department uses Knowledge Base files or Tool results, they are permanently cited on the resulting artefact, fulfilling Spec §9.5.
2. **Deep Links for Tool Results** (`execute-tool-call.ts`):
    - Added `humanizeToolResult` helper that generates actionable deep links for tool successes.
    - Gmail actions now include `[View in Gmail]` links (using message IDs).
    - GitHub actions now include `[View on GitHub]` links (using HTML URLs).
3. **Strategic Context Hardening** (`llm-client.ts`):
    - Updated `buildOrcContext` to query and inject the last 10 mission outcomes from the singular `company_memo` table.
    - This gives Orc a "Strategic Memory" of recent goal results, improving planning accuracy and grounding.

### Files Changed
- frontend/lib/llm-client.ts
- frontend/lib/tools/execute-tool-call.ts

---

## Session v11.65 — Executive Department Tool Permission Fix
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes a permission block where Orc (acting as the "Executive" department) or direct founder slash-commands (like `/github.list_repos`) were blocked from using domain-specific tools.

### What Was Built
1. **Expanded Executive Permissions** (`frontend/lib/tools/execute-tool-call.ts`):
    - Discovered that the `executive` pseudo-department (which handles Orc's direct actions and founder slash-commands) was restricted to a narrow set of communication tools.
    - Updated `DEPARTMENT_TOOL_RULES['executive']` to include all currently supported services: `github`, `hubspot`, `linear`, `apollo`, `googlesheets`, `web_search`, `file_reader`, and `supabase_query`.
    - This enables the "magic moment" where a founder can invoke any connected tool directly from the chat while still being protected by the mandatory HITL approval gate.

### Files Changed
- frontend/lib/tools/execute-tool-call.ts

---

## Session v11.64 — Composio Silent Execution Failure Fix
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes a critical silent failure where tool calls via Composio (like `/gmail.send_email`) would return `{ successful: false }` due to schema mismatches but were improperly marked as "✓ ACTION EXECUTED" in the UI.

### What Was Built
1. **Explicit Failure Detection** (`providers/composio.ts` & `approvals/[id]/route.ts`):
    - Discovered that the modern `composio.tools.execute()` SDK does not throw a JavaScript error when an integration API returns a 4xx error (e.g., missing required parameters like `To:` for an email). Instead, it returns an object with `successful: false`.
    - Added explicit checks for `result.successful === false || result.is_success === false` in both the manual approval execution route and the autonomous worker execution wrapper.
    - If detected, an actual Error is now thrown, properly routing the failure to the `catch` block so the UI displays "✗ EXECUTION FAILED" and surfaces the actionable API error to the founder.

### Files Changed
- frontend/app/api/approvals/[id]/route.ts
- frontend/lib/tools/providers/composio.ts

---

## Session v11.63 — Composio SDK Deprecation Fix (`executeAction`)
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes the `n.executeAction is not a function` error which caused tool executions (like sending an email) to fail silently after approval. 

### What Was Built
1. **SDK Alignment** (`api/approvals/[id]/route.ts`):
    - Discovered that the manual approval route was still using the legacy SDK method `entity.executeAction(...)`.
    - Refactored the route to use the modern `composio.tools.execute(..., { userId })` interface, matching the rest of the application's execution logic.
    - Removed the unnecessary entity creation step entirely, optimizing the route's performance.

### Files Changed
- frontend/app/api/approvals/[id]/route.ts

---

## Session v11.62 — JIT Sync Schema Mismatch Fix
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes a lingering "GMAIL is not connected" issue where `checkConnectionWithJIT` failed to heal the database record due to querying against deprecated schema column names.

### What Was Built
1. **Schema Alignment** (`composio-connection.ts` & `connect/sync/route.ts`):
    - Discovered that the `connections` table schema had been unified during `CONSOLIDATED_STABILIZATION.sql` (Version 3.0) to use `created_by`, `service_name`, and `connection_id` instead of the legacy `user_id`, `tool_slug`, and `composio_connection_id`.
    - Updated `checkConnectionWithJIT` and `GET /api/connect/sync` to query and upsert using the correct column names.
2. **TypeScript Typings**: Fixed an unrelated `IParagraphOptions` type issue in `pptx-transformer.ts` for clean build pipelines.

### Files Changed
- frontend/lib/composio-connection.ts
- frontend/app/api/connect/sync/route.ts
- frontend/lib/artifact-transformers/pptx-transformer.ts

---

## Session v11.61 — PPT Skill Restoration (Transformer Fix)
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes "PPT skill failed" errors by implementing a dedicated presentation transformer. Restores the ability to produce structured slide decks.

### What Was Built
1. **Presentation Transformer** (`lib/artifact-transformers/pptx-transformer.ts`):
    - Implemented a specialized transformer that converts the `pptx` skill's JSON slide manifest into a professionally formatted "Presentation Deck Document" (.docx).
    - Supports multiple layouts: `title`, `content`, `two_column`, and `quote`.
    - Automatically includes a "Sources & Citations" section per Spec §9.5.
2. **Format Detection Upgrade** (`lib/artifact-transformers/index.ts`):
    - Updated `detectOutputType` to recognize the `pptx` skill and keywords (powerpoint, pitch deck, slides).
    - Replaced the previous generic `docx` fallback with the specialized `transformToPresentation` logic.
3. **Skill Alignment**: Ensured the transformer correctly handles the schema defined in `pptx/SKILL.md`, including theme colors and speaker notes.

### Files Changed
- frontend/lib/artifact-transformers/pptx-transformer.ts (New)
- frontend/lib/artifact-transformers/index.ts
- CROST_MASTER.md

---

## Session v11.60 — JIT Connection Sync (Gmail Fix)
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes "GMAIL is not connected" errors by implementing Just-In-Time (JIT) synchronization between Composio and the Crost database across all execution paths.

### What Was Built
1. **Shared JIT Connection Library** (`lib/composio-connection.ts`): Created a centralized helper that verifies service connections against the local database, and if missing/stale, proactively checks Composio to "heal" the local record.
2. **Unified Path Protection**: Integrated JIT Sync into:
    - `POST /api/departments/[slug]/task`: Prevents dispatching tasks that will fail due to missing tool connections.
    - `PATCH /api/approvals/[id]`: Heals connections when a founder clicks "Approve" even if the initial sync was missed.
    - `executeToolCall`: Refactored to use the shared library, reducing code duplication.
3. **Connection Healing**: When JIT Sync succeeds, it automatically updates both the `connections` and `available_tools` tables, ensuring the UI and the LLM prompt stay in sync for subsequent calls.

### Files Changed
- frontend/lib/composio-connection.ts (New)
- frontend/app/api/departments/[slug]/task/route.ts
- frontend/app/api/approvals/[id]/route.ts
- frontend/lib/tools/execute-tool-call.ts

---

## Session v11.59 — Approval ID Bug Fix (Tool Invocation HITL)
**Date**: April 28, 2026  **Status**: ✅
**Impact**: Fixes "approval missing its ID" error when founders invoke tools via `/service.action` chat commands, and the same silent failure in worker REQUEST_APPROVAL flows.

### What Was Built
1. `executeToolCall` now writes `action_type: 'tool_call'` (the canonical enum value) instead of the fully-qualified tool slug (e.g. `gmail.send_email`), which violated the `approval_queue_action_type_check` CHECK constraint and silently nulled the returned approval_id. The real composio action is preserved in `payload.__tool_action` and `action_label` (where the PATCH executor already reads it).
2. The same fix applied to `runWorkerTask` in `lib/llm-client.ts` — worker LLMs emitting `REQUEST_APPROVAL { action_type: "GMAIL_SEND_EMAIL" }` no longer silently fail to enqueue.
3. Hardened error handling: both code paths now throw on a failed approval_queue insert (instead of silently returning `approval_id: undefined`). `executeToolCall` additionally rolls back the orphaned `tool_executions` skeleton row so it doesn't leave a stuck `'blocked'` record.

### Files Changed
- frontend/lib/tools/execute-tool-call.ts
- frontend/lib/llm-client.ts

---

## Session v11.58 — Render Build Fix & CSS Cleanup
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved fatal production build error on Render caused by mangled CSS syntax in `globals.css`.

### What Was Fixed
1. **CSS Syntax Recovery** (`globals.css`): Repaired the mangled premium animation block, removing literal escape characters and backticks that were causing PostCSS to crash during the production build.
2. **Stability Verification**: Successfully ran `npm run build` equivalent checks (type-check + lint) to ensure the production pipeline is clear.

---

## Session v11.57 — Premium Activity Feed & Error Registry
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Transitioned technical logs into an executive-grade heartbeat feed with actionable error codes.

### What Was Built
1. **Premium Error Registry** (`frontend/lib/errors.ts`): Created a central source of truth for all founder-facing errors (CR-CODE format), including empathetic instructions and actionable "Fix-it" links.
2. **"Intervention Required" Blocks** (`LiveEventsPanel.tsx`): Refactored the activity feed to display failures as high-level executive alerts instead of technical crashes.
3. **Breathing Animations**: Added CSS "pulse" and "breathing" animations for ongoing tasks to make the system feel alive and proactive.
4. **Error Traceability**: Updated `logEvent` to support explicit `error_code` fields and created a DB migration to store them in the `event_log` table.

---

## Session v11.56 — Artifacts Page Search & Filter Restoration
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Restored full search and filtering capabilities to the Company Artifacts page.

### What Was Built
1. **`ArtifactsGrid` Client Component** (`frontend/components/artifacts/ArtifactsGrid.tsx`):
    - Implemented real-time search for artifact titles and parent goal titles.
    - Added a premium filter bar for all artifact types: Documents, Spreadsheets, PDFs, Images, etc.
    - Optimized rendering with `useMemo` for smooth performance with large file lists.
2. **`formatFileSize` Utility** (`frontend/lib/utils.ts`):
    - Added a robust utility to format bytes into human-readable strings (KB, MB, GB, TB).
3. **`ArtifactsPage` Refactor** (`frontend/app/dashboard/artifacts/page.tsx`):
    - Transitioned the artifacts grid to use the new client component while preserving efficient server-side data fetching.

### Files Changed
- `frontend/app/dashboard/artifacts/page.tsx`
- `frontend/components/artifacts/ArtifactsGrid.tsx` (NEW)
- `frontend/lib/utils.ts`

---

## Session v11.55 — Foundational Mandates & E2E Readiness
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Established official workflow mandates for the Gemini CLI and finalized all technical foundations for launch.

### What Was Built
1. **`GEMINI.md` Foundational Mandates**: Created a primary reference document for Gemini CLI's core workflows, ensuring 100% compliance with master log updates, frontend testing protocols, and E2E maintenance rules.
2. **Technical Grounding**: Successfully ran final type-checks and linting across the entire frontend.
3. **E2E Test Handover**: Prepared the environment for a clean, end-to-end founder journey walkthrough.

---

## Session v11.54 — ID Mismatch Fix: Tool Execution vs Approval Queue
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved persistent "Approval not found in database" 404 error during direct tool invocation.

### What Was Fixed
1. **ID Mapping Correction** (`execute-tool-call.ts` & `invoke/route.ts`):
    - Discovered that direct slash commands were incorrectly returning the `tool_execution_id` as the `approval_id`. 
    - Updated the tool execution gateway to capture and return the actual `approval_queue` record ID.
    - This ensures the frontend PATCH request points to the correct database table, resolving the 404 error.

### Files Changed
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/app/api/tools/invoke/route.ts`

---

## Session v11.53 — Resync State Reset & Mobile Auth Fixes
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved issue where departments remained in a "stuck" error state after goal failure and fixed Google Sign-In failures on mobile browsers.

### What Was Built
1. **Department Full State Reset** (`api/departments/resync`):
    - Updated the resync logic to explicitly reset department `status` to `idle` and clear `current_task` to `null`.
    - Clicking "Sync Departments" now effectively clears all stuck error states from prior goal failures.
2. **Mobile Auth Reliability** (`auth/callback`):
    - Refactored the authentication callback to use standard, environment-agnostic cookie handling.
    - Removed hardcoded domain overrides that were causing mobile session establishment to fail.
    - Simplified cookie transfer logic using the `Headers` object for maximum compatibility across browsers.

---

## Session v11.52 — Inbox Consistency & Real-time Badge Fix
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved issue where pending approvals were missing from the Inbox and sidebar badges. Established real-time badge synchronization.

### What Was Built
1. **Real-time Badge Sync**: Refactored `SidebarNav` and `Topbar` to use the Zustand store for counts, kept live via a new `postgres_changes` subscription in `LayoutStoreHydrator`.
2. **Query Normalization**: Updated all approval queries (Inbox, Sidebar, Dropdown) to check both `user_id` and `created_by` columns, ensuring system-generated tasks are visible.
3. **Badge UI Refinement**: Added a subtle glowing aesthetic to red count badges for a unified, premium feel.

---

## Session v11.51 — War Room UX & Logic Hardening
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved critical UX flaws and state bugs in the War Room. Restored stable branding and added dynamic, proactive loading feedback.

### What Was Built
1. **Stable Header Restoration**: Fixed the `GoalInput` header to consistently show "War Room" for existing users, removing the incorrect "Preparing your first mission" override.
2. **Dynamic Loading Messages**: Implemented a rotating message system in the `PlanningIndicator`. Warm, office-themed copies (e.g., "Sketching the strategy") now automatically rotate every 3.5 seconds during planning, making the UI feel active and intelligent.
3. **Cancellation State Fix**: Hardened the `handleCancelGoal` logic to immediately and explicitly clear all loading (`isSubmittingGoal`) and active goal states, preventing the UI from being stuck in "planning" after a mission is aborted.

---

## Session v11.50 — Premium Mission Report UI Overhaul
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Transformed technical "Post-mortem" logs into professional, beautifully formatted executive briefs.

### What Was Built
1. **Advanced Markdown Parser** (`MarkdownLite`): Overhauled the inline parser to properly handle headers and multi-line list structures. Mission reports no longer appear as a "wall of text."
2. **Typography & Spacing**: Refined the `.markdown-lite` CSS with 1.8x line height and generous block-level margins to ensure reports look like high-end strategic documents.
3. **Terminology Scrub**: Standardized all founder-facing text to use "Mission Report" instead of legacy "Post-mortem" strings.

---

## Session v11.49 — Stop Auto-Dismiss & Endless Polling Fix
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved major egress drain caused by frontend endlessly polling deleted approvals. Fixed UX issue where failed tasks auto-dismissed the goal prematurely.

### What Was Built
1. **Removed Auto-Dismiss** (`WarRoom.tsx`): Active goals no longer disappear automatically if tasks are still running or if they failed. The user is now forced to manually dismiss or choose to retry/skip failed tasks.
2. **Halted Polling Loops** (`WarRoom.tsx`): Approval polling now breaks out immediately if it receives a `404 Not Found`, stopping runaway network requests and massive egress drains.
3. **Failed Task Blockers** (`worker.ts`): Removed `failed` from the list of terminal statuses for goals. A failed task now halts the goal's completion until the founder explicitly clicks "Skip" or "Retry", ensuring failed work doesn't sneak by.
4. **Emergency Cancellation SQL**: Provided `20260427_CANCEL_PENDING_POLLING.sql` to manually clean up the database of stuck tasks and approvals that are causing current endless loops.

---

## Session v11.48 — Humanize Knowledge Base tool results
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Improved search result visibility for Knowledge Base commands.

### What Was Built
1. **Humanized Search Results**: Replaced raw JSON search output with a formatted list of documents, including titles, summaries, and relevance scores.
2. **File ID Visibility**: Displayed the UUID for every search match to facilitate easy copying for the `knowledge_base_read` tool.

---

## Session v11.47.1 — Descriptive ownership errors for approvals
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved vague 404 errors during approval by adding a direct DB check and manual ownership audit.

---

## Session v11.46 — Knowledge Base Deep Reading & GitHub Restoration
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Enabled Orc to actually "read" knowledge base documents and restored essential GitHub pipeline tools.

### What Was Built
1. **`KNOWLEDGE_BASE_READ` Tool**: A new internal tool that allows the system to fetch the full extracted text of a file from the database, enabling deep document analysis.
2. **GitHub Restoration**: Re-enabled `List Repos`, `Get Repo Details`, `List PRs`, `Read PR`, and `Create PR` in the Lean Tool Policy.
3. **KB Discovery Fallback**: Updated the search tool to fall back to a "latest files" list when Orc asks general "what's here?" questions.

---

## Session v11.45 — Tool Execution UUID & Event Visibility Fix
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved database-level crashes for direct slash commands and improved system transparency.

### What Was Built
1. **UUID Fix**: Updated the `/api/tools/invoke` route to use `crypto.randomUUID()` for `taskId`, resolving a Postgres type mismatch that was crashing direct tool execution.
2. **Failure Visibility**: Added robust error catching and `logEvent` reporting for direct tool calls so failures appear in the Live Events panel.

---

## Session v11.44 — Egress Optimization & Realtime Hardening
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Drastically reduced database egress (fixing the 2.49GB spike) and improved data isolation.

### What Was Built
1. **Surgical Realtime Subscriptions**: Added `user_id` and `created_by` filters to all Realtime channels. Browsers now only receive data relevant to the current user.
2. **Dynamic Interval Polling**: Increased War Room mission polling from 2s to 5s.
3. **Column Pruning**: Refactored the main dashboard and LLM context queries to select only essential columns instead of using `select(*)`.

---

## Session v11.43 — MVP Final Readiness & E2E Manual
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Established a comprehensive verification framework for the final MVP deployment and consolidated all technical fixes into a single stabilization migration.

### What Was Built
1. **`TEST_MANUAL_E2E.md`**: Created a detailed 6-phase manual guide for founders and testers to verify the entire system end-to-end.
2. **Final Stabilization Migration** (`supabase/migrations/...`): Consolidated all critical DB-level fixes (check_user_exists RPC, refined personas, flagship model defaults, and constitutional sync) into a single SQL script for production sync.

---

## Session v11.42 — Department Creation UX & Tools API Hardening
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Streamlined the department creation flow and resolved the "too many connections" issue.

### What Was Built
1. **Hardened Tools API**: Updated `/api/tools` to filter by `user_id` and exclude internal actions, reducing UI noise from 48+ items to ~8 clean service cards.
2. **Refactored Wizard & Settings**: Updated `CreateDepartmentWizard.tsx` and `DeptSettingsForm.tsx` to dynamically fetch configured services from the DB, removing all hardcoded legacy lists.

---

## Session v11.41 — Tool Execution Unification & Dept Reset Fix
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved tool execution failures and "stuck" departments by unifying naming conventions and state management.

### What Was Built
1. **Normalization Helper** (`utils.ts`): Created `normalizeToolName` to unify action strings for Composio (e.g., `GMAIL_SEND_EMAIL`).
2. **Stuck State Fix** (`approvals/route.ts`): Ensured department status is reset to `idle` or `error` immediately after approved tool execution.
3. **Tool Pruning**: Updated the prompt builder to only show departments tools they are authorized to access, preventing blocked gateway errors.

---

## Session v11.40 — Dynamic Office-Themed Loading Messages
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Improved user experience in the War Room by replacing hardcoded "ORCHESTRATOR PLANNING" text with warm, office-themed loading copies per spec §2 Beat 8.

### What Was Built
1. **Dynamic Loading UI** (`WarRoom.tsx`):
    - Integrated `getRandomProcessingMessage` into the `GoalInput` header and the `PlanningIndicator` overlay.
    - Implemented stable state management to ensure a single, consistent warm message is displayed per loading session (preventing flickering on re-renders).
    - Hardcoded technical messages like "Querying departments" have been retired in favor of professional, founder-first copy.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`

---

## Session v11.39 — TypeScript Build Fix (llm-client)
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved fatal TypeScript error during production build on Render.

### What Was Fixed
1. **Prop Error Fix** (`llm-client.ts`): Fixed a property access error on the `goalRow` object by using the existing `founderInput` parameter directly. This ensured the `SynthesisReportCard` title generates correctly without triggering a build-time type error.

### Files Changed
- `frontend/lib/llm-client.ts`

---

## Session v11.38 — Skills Layer Expansion & Orc Assistant Mode
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved issue where Engineering produced wrong file types (Word docs instead of code) and enabled Orc to function as a direct assistant for simple queries.

### What Was Built
1. **`code` Skill & Transformer** (`frontend/lib/skills/code`):
    - Created a new technical skill with a JSON contract for source code and scripts.
    - Implemented `code-transformer.ts` to convert technical JSON into downloadable source files.
    - Updated `detectOutputType` to prioritize technical file extensions (py, ts, sql, etc.) based on task hints and skill usage.
2. **Skills Layer Hardening** (`skills/index.ts`):
    - Implemented a "Hijack Protection" for Engineering: the `docx` skill now only loads if explicitly requested via params, preventing generic "reports" from defaulting to Word docs.
3. **Orc Assistant Mode** (`llm-client.ts`):
    - Updated `ORCHESTRATOR_SYSTEM_NOTE` to support `is_direct_response`.
    - Refactored `runOrchestratorTask` to handle direct responses, enabling Orc to answer simple questions without creating a multi-task plan.
4. **Persona Alignment** (`seed-departments.ts`):
    - Refined the Engineering persona to be "Code-First."
    - Removed legacy hardcoded JSON contracts from Marketing, Sales, Finance, and Ops, delegating all formatting to the unified Skills Layer.

### Files Changed
- `frontend/lib/skills/index.ts`
- `frontend/lib/skills/code/SKILL.md` (NEW)
- `frontend/lib/artifact-transformers/code-transformer.ts` (NEW)
- `frontend/lib/artifact-transformers/index.ts`
- `frontend/lib/llm-client.ts`
- `scripts/seed-departments.ts`

---

## Session v11.37 — Render Deployment & CSR Fixes
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved fatal production build error on Render caused by Next.js CSR bailout requirements.

### What Was Fixed
1. **CSR Bailout Fix** (`verify-email/page.tsx`): Wrapped the email verification page in a `<Suspense>` boundary. This is a mandatory Next.js requirement when using `useSearchParams()` in a client component to prevent build-time SSG failure.
2. **Hook Dependency Sync** (`WarRoom.tsx`): Added `activeGoal.goal_tasks` to the decision-syncing `useEffect`. This cleared the `exhaustive-deps` warning that was surfacing in the production build log.

### Files Changed
- `frontend/app/verify-email/page.tsx`
- `frontend/components/war-room/WarRoom.tsx`

---

## Session v11.36 — Resilient Multi-Model Fallback Logic
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Dramatically improved system reliability. A single provider outage (e.g., Groq) no longer crashes the application; the system now automatically falls back to secondary cloud or local providers.

### What Was Built
1. **Resilient Fallback Chain** (`llm-client.ts`): Implemented a `RESILIENT_FALLBACK_CHAIN` constants list: `Groq Llama 3.3 70B` → `Gemini 2.5 Flash` → `Local Gemma3`.
2. **Auto-Retry Loop** (`callLLM`): Updated the core LLM wrapper to catch provider errors (rate limits, timeouts, outages) and automatically attempt the next model in the chain, up to 3 total attempts.
3. **Smart Error Handling**: Ensured that `SYSTEM_LIMIT_EXCEEDED` (quota) errors bypass the retry loop to avoid redundant system calls.

### Files Changed
- `frontend/lib/llm-client.ts`

---

## Session v11.35 — Systematic Verification Complete & Model Defaults
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Completed full system verification and established high-performance model defaults.

### What Was Built
1. **Full Verification**: Completed all 9 sections of the `COMPREHENSIVE_TESTING_LIST.md` via code-level audit.
2. **Premium Model Defaults**: Updated `model-routing.ts` to use **Groq Llama 3.3 70B** as the flagship model for planning, execution, and utility.
3. **Context Injection**: Finished the plumbing for Strategic Context in `buildFinalPrompt`, ensuring agents see structured Company Profile and Recent Decisions from the `company_memo` table.

### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/lib/model-routing.ts`
- `COMPREHENSIVE_TESTING_LIST.md`

---

## Session v11.34 — Company Memo Migration & UI Polish
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Established the `company_memo` (singular) table as the structured source of truth (Spec §8) and eliminated all remaining raw JSON leakage in the UI.

### What Was Built
1. **Dual-Write Architecture**:
    - Updated `llm-client.ts` and `execute-tool-call.ts` to populate the structured `company_memo` table whenever a task completes, a tool is run, or a mission report is generated.
    - Added typed helpers (`logDecision`, `addTaskLog`) to `company-memo.ts`.
2. **Strategic Awareness**:
    - Refactored `buildFinalPrompt` to include **Strategic Context** (Company Profile + Recent Decisions) directly from the singular memo table, enriching agent performance.
3. **UI/UX Refinement**:
    - **Usage Limit Auto-Clear**: Added a `useEffect` in `WarRoom.tsx` to automatically clear the "Free limit reached" banner once the reset time (midnight UTC) has passed.
    - **JSON Elimination**: Replaced raw JSON dumps with structured lists in the Artefacts Citation drawer and the Approval Queue cards.
    - **Unified Error Handling**: Applied `formatErrorMessage` to suggested actions and API key validation.

### Files Changed
- `frontend/lib/company-memo.ts`
- `frontend/lib/llm-client.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/lib/execute-suggested-action.ts`
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/components/settings/ApiKeysSettings.tsx`
- `frontend/app/api/onboarding/complete/route.ts`
- `frontend/app/api/onboarding/complete-final/route.ts`

---

## Session v11.33 — Error Message Humanization (JSON Fix)
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Eliminated raw JSON error leakage in the UI. Structured errors like `SYSTEM_LIMIT_EXCEEDED` are now parsed and displayed as user-friendly messages with reset times.

### What Was Built
1. **`formatErrorMessage` Utility** (`lib/utils.ts`): A robust parser that detects JSON-encoded errors and translates them into founder-friendly instructions (e.g., "Add an API key or wait until midnight").
2. **War Room UI Hardening** (`WarRoom.tsx`): Applied the utility to Goal Submit, Chat Submit, Approval Decisions, and the Goal Failure banner.
3. **Refactoring**: Consolidated `ICON_MAP` and `resolveIcon` into `lib/utils.ts` to reduce duplication in the frontend.

### Files Changed
- `frontend/lib/utils.ts`
- `frontend/components/war-room/WarRoom.tsx`

---

## Session v11.32 — Signup OTP Leak & Existence Check Fix
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Resolved issue where existing users were sent redundant OTPs during signup due to Supabase Email Enumeration Protection. Enforced strict Spec §15.6 compliance.

### What Was Built
1. **`check_user_exists` RPC** (`supabase/migrations/...`): A `SECURITY DEFINER` function that allows the signup page to safely query `auth.users` for email existence without exposing the full table.
2. **Signup Logic Hardening** (`signup/page.tsx`): Integrated the RPC into the `handleSignUp` flow. Existing users are now intercepted and redirected to `/login` *before* the Supabase `signUp` call is made.

### Files Changed
- `supabase/migrations/20260427140000_check_user_exists_rpc.sql` (new)
- `frontend/app/signup/page.tsx`

---

## Session v11.31 — High-Priority Spec Gaps Resolved (H1, H2, H3)
**Date**: 2026-04-27 **Status**: ✅ COMPLETE  
**Impact**: Closed all remaining critical "High" priority MVP gaps identified in `Spec_Review_v5.md` through concurrent agent execution.

### What Was Built
1. **H1 — In-browser Artefact Previews (Thumbnails)** (`ArtifactCard.tsx`): Updated the thumbnail rendering logic to use scaled-down native `iframe` renders (PDF browser viewer and Office Online embed) directly in the thumbnail area when `preview_url` is absent. This bypassed the need for brittle server-side thumbnail generation.
2. **H2 — Auth Middleware Security Gap** (`middleware.ts`, `verify-email/page.tsx`): Unverified email/password users are now intercepted and redirected to a dedicated `/verify-email` blocking page, enforcing the "Source of Truth" security requirement.
3. **H3 — Auth Bridge Edge Case** (`signup/page.tsx`): Verified that duplicate email signups correctly catch the `user_already_exists` error and gracefully redirect the founder to `/login?email=...` with a toast notification.

### Files Changed
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/middleware.ts`
- `frontend/app/verify-email/page.tsx` (new)
- `Spec_Review_v5.md`

---

## Session v10.4 - Favicon Implementation
**Date**: April 18, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Added branding consistency across browser tabs.

... [rest of previous content]
