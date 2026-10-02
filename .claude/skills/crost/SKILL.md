---
name: crost
description: Institutional memory for Crost — a human-in-the-loop AI Company OS (Orc Chief-of-Staff + four department agents on Gemini, one Next.js app on Vercel, Supabase Auth/Postgres/Storage). Activate for ANY task in this repo — features, bugs, tests, refactors, routes, worker, approvals, artifacts, KB, onboarding, security, or the 10x rebuild plan. Encodes load-bearing invariants, known-fixed bugs, and the file map.
---

# Crost — Institutional Memory

## Product model (30 seconds)

Founder submits ONE goal → **Orc** (Chief of Staff, Gemini 2.5 Flash via the Google AI API key) plans 3–5 tasks → delegates to four fixed **Department agents** (Marketing/Engineering/Sales/Operations — per-founder copies of global template rows) → departments produce **artifacts** (Supabase Storage) and **memos** (Postgres) → Orc synthesizes a **Mission Report**. Any external action (send email, post, pay) creates an **approval request**; nothing external executes without founder approval. "Not a chatbot. An office."

**Beta scope (cut, don't re-add unasked):** MCP server, BYO keys, recurring missions, calendar prep, knowledge base, dynamic departments, Composio, ADK/Vertex, the polling worker. Deploy: `docs/DEPLOY_VERCEL.md`.

Docs: `CROST_SPEC.md` (product truth; §6.1 suggested actions, §9.4 artifact lifecycle are the trickiest contracts) · `CROST_MASTER.md` (session log — APPEND after each session) · `REMEDIATION_HANDOFF.md` (18 audit findings, all ✅ fixed — regression-test them, don't redo) · `docs/DEVELOPMENT_PLAN_10X.md` + `docs/TEST_SPEC_10X.md` (current rebuild effort) · `ARCHITECTURE.md`.

## MANDATORY working discipline (follow every session, no exceptions)

This section exists because sessions run on models with less judgment than the one
that wrote this file. Do not improvise around it.

**Before touching any code:**
1. State a plan: which files you'll touch, which invariants (below) each change
   could affect, and which tests prove it works. If the task touches auth, money,
   approvals, artifacts, or worker execution, write the plan out and get Joy's OK
   before editing.
2. Check rebuild state: `llm-client.ts` is being split into `lib/engine/*` per the
   10x plan. `ls frontend/lib/engine/` first — edit the NEW module if it exists,
   never re-fatten the god module.
3. Grep before you create. This repo almost always already has a helper
   (`lib/api-response`, `lib/errors`, `lib/idempotency`, `lib/rate-limit`).
   Duplicating one is a bug.

**Before declaring anything done:**
1. `cd frontend && npm run type-check && npm run test:unit` — both green, actually
   run them, don't assume.
2. Re-read your diff against the "Load-bearing invariants" list below, one by one.
3. New behavior → new test (contracts in `docs/TEST_SPEC_10X.md`). Bug fix →
   regression test that fails without the fix.
4. Append a session summary to `CROST_MASTER.md`.

**Stop and ask Joy instead of deciding when:** a change would weaken the approval
gate, alter the dual-mode auth pattern, add a third DB access style, touch billing/
cost tracking, change the MCP tool surface (it's exactly 5 tools by contract), or
require a destructive migration.

## File map (don't re-explore)

- **Engine (the heart):** `frontend/lib/llm-client.ts` — 1744-line god module: `runOrchestratorTask` (Orc planning), `runWorkerTask` (department execution), `runOrcReport`, `parseApprovalRequest`, `buildOrcContext`, `callLLM`/`callLiteLLM`, `checkTokenBudget`, `logEvent`. Being split into `lib/engine/{model,prompt,parse,orchestrator,worker,memo,budget,events}.ts` per the 10x plan — check which state you're in.
- **Serverless execution:** `lib/background.ts` (`runInBackground` = `waitUntil`; `triggerDispatch` = internal-secret dispatch), `lib/engine/supervisor.ts` (stateless reaper/escalation/dependency-release/goal-close, behind `/api/cron/supervise`), `lib/auth/cron.ts` (`requireCronSecret`, hard-fails 500 if unset). ADK/MCP were removed.
- **Decisioning:** `lib/orc-decision-gate.ts` (response-mode gate + context cache — remember `invalidateOrcContextCache`), `lib/risk-assessor.ts`, `lib/output-classifier.ts`, `lib/capability-checker.ts`.
- **Tools:** `lib/tools/execute-tool-call.ts` = the approval gateway (every external tool call becomes a pending `approval_queue` row — there is NO auto-run; `DEPARTMENT_TOOL_RULES` allowlist per department), `lib/tools/parameter-resolver.ts` (drafts email bodies from intent), `lib/google/{gmail,oauth,auth}.ts` — native Gmail send via the founder's own OAuth connection (tokens sealed with `lib/crypto.ts`). Execution happens in `PATCH /api/approvals/[id]` after approval.
- **Artifacts:** `lib/artifact-transformers/` (7 transformers + `heal-payload.ts` + dispatch `index.ts`), `lib/storage.ts` (Supabase Storage adapter), routes `app/api/artifacts/*` incl. `make-changes` (versioning) and `download` (signed URL).
- **Data:** `lib/db.ts` (pg Pool + `createDbClient()` — a Supabase-API-compatible SHIM over raw pg; see gotchas), `lib/supabase.ts` (server facade: DB shim + Supabase Auth cookie session + Storage), `lib/supabase-admin.ts` (service-role client), `lib/supabase-browser.ts` (auth only; table access from the browser is a deliberate no-op). Target state: typed repos in `lib/data/`.
- **Worker:** none — `app/api/worker/execute/route.ts` (dual-mode auth exemplar) + dispatch route run inside functions; see Serverless execution above.
- **Product features:** `lib/suggested-actions.ts` + `execute-suggested-action.ts` (spec §6.1 canonical contract; no save_to_kb / schedule_recurring chips), `lib/company-memo.ts`.
- **Marketing:** `app/(marketing)/*`, `components/marketing/*` (`BridgeScroll.tsx` hero, `MarketingShell.tsx`, `styles.ts` rendered via `<style dangerouslySetInnerHTML>` — a multi-child `<style>` breaks hydration), `lib/marketing-config.ts`, `app/api/waitlist/route.ts`.
- **Infra utils:** `lib/{api-response,errors,idempotency,rate-limit,cost-tracker,cost-table,usage-logger,crypto,refresh-token,env,beta-departments}.ts`, `middleware.ts` (Supabase session gate for `/app`, onboarding routing, CSRF origin check), `instrumentation.ts` (logs missing env at boot).
- **Tests:** `frontend/tests/unit/` (vitest, mocks in `setup.ts`), `frontend/tests/e2e/` (playwright, `fixtures/llm-mocks.ts`), legacy `frontend/__tests__/`.
- **Schema:** `supabase/migrations/20261001000000_crost_beta_baseline.sql` (then append-only files). Deploy: Vercel (`frontend/vercel.json`, root dir `frontend`). Old GCP files: `archive/gcp-legacy/`.

## Load-bearing invariants

1. **Dual-mode auth pattern** (memorize it): routes serve either a session user (`auth.getUser()` → use `user.id`, add `.eq('created_by', user.id)`) OR a trusted internal caller (`x-crost-internal-secret` header — historically `SUPABASE_SERVICE_ROLE_KEY`, migrating to `WORKER_INTERNAL_SECRET`). Body-supplied `userId` is ONLY valid with the secret. Exemplar: `app/api/worker/execute/route.ts`.
2. **Approval gate:** external actions require an approved `approval_queue` row first, and `executeToolCall` never auto-runs. Cron routes go through `requireCronSecret` and must return 500 if `CRON_SECRET` is unset — `if (cronSecret)` skip-auth was audit finding #7.
3. **Artifact immutability & storage:** approved (active) artifacts never mutate (DB trigger enforces it; "Make Changes" = new version, §9.4). The bucket is PRIVATE — downloads stream via the ownership-checked route; do not double-prefix the object path.
4. **Never return raw tool/LLM JSON to the UI** (finding #9) — humanize results.
5. **Department tool allowlist:** `DEPARTMENT_TOOL_RULES` gates which tools each department may call. Don't bypass.
6. **Cross-user access returns 404** (not 403). Ownership scoping on every update site too — `goals/[id]/dialogue` had 3 unscoped updates (finding #8).

## Mistakes a smaller model WILL make here (checked against real history)

Each of these has happened or nearly happened. Check your diff against every line.

- **Copying a route without the ownership filter.** Every user-facing query AND
  update needs `.eq('created_by', user.id)`. Reads without it leak data; updates
  without it let users mutate others' rows (finding #8 was exactly this).
- **Accepting `userId` from the request body** on a session-authed path. Body
  `userId` is valid ONLY when the internal-secret header is present.
- **Wiring a new integration through a third-party broker.** Composio is gone. Native Google (`lib/google/*`) is the pattern.
- **Adding a query operator to the `createDbClient()` shim without a test.** The
  shim hand-parses operators; an unparsed operator fails silently or hangs
  (53bfe0c was an operator bug).
- **Un-awaited fire-and-forget on Vercel** — the instance freezes when the response is sent; use `runInBackground`/`triggerDispatch`.
- **Adding a table without RLS** — the Supabase public API would expose it. ENABLE RLS + REVOKE from anon/authenticated.
- **Mutating an approved artifact** instead of creating a version via
  make-changes. Also: building GCS paths by string concat → double prefix.
- **"Fixing" the cron by making auth optional.** If the cron secret env is unset
  the route must 500, not skip auth.
- **Editing `llm-client.ts` when the split module already exists** — re-check
  `lib/engine/` every session; the rebuild moves between sessions.
- **Trusting a green build over a green test run.** Type-check passing does not
  mean the operator shim, auth mode, or approval flow works. Run `test:unit`.

## Gotchas & known-fixed bugs (write regression tests, don't rediscover)

- **`createDbClient()` is a shim**, not real Supabase: it parses operators like `.or()`/`.not()` itself. Operator-parsing bug caused assistant-mode hang (fixed 53bfe0c). Any new query operator through the shim needs a test.
- **Google OAuth is origin-aware:** redirect URIs are limited to `NEXT_PUBLIC_APP_URL` + `crosthq.com`/`www`. Offline access/refresh tokens are stored sealed (AES-GCM) in `connections` and auto-refreshed.
- **Email bodies are drafted from intent** in `parameter-resolver.ts` (e596c06) — don't send empty bodies.
- **Gmail send is native** (`lib/google/gmail.ts`). `send_email` and `gmail_*` approvals both execute through it.
- **Model config:** `GEMINI_API_KEY`; `CLOUD_MODEL` env, default `gemini/gemini-2.5-flash`; `lib/gemini-client.ts` remaps retired/non-Gemini names. No per-user model routing.
- **One DB access style:** the pg shim everywhere (Supabase-js is used only for Auth admin + Storage). Don't add another; 10x plan converges on `lib/data/` repos.
- **Pooler:** on Vercel use Supabase's transaction pooler URL; the shim never uses named prepared statements.
- Root is littered with historical review docs (`Spec_Review_v*.md`, audit reports) — reference only; the live ones are SPEC, MASTER, plan, test spec.
- `.env.example` is the env contract; real secrets in `.env`/Secret Manager — never read or commit them.

## Working protocol

Type-check + unit tests green before every commit (`cd frontend && npm run type-check && npm run test:unit`). Test-first for behavior changes (contracts in `docs/TEST_SPEC_10X.md`). Append a session summary to `CROST_MASTER.md` when done. Migrations are append-only new `cloudsql_fixes_*.sql` files. 

## How the original advisor thought about this codebase (judgment to preserve)

- The product's moat is the **approval gate + artifact lifecycle** — trust
  primitives. When a feature request conflicts with them, the feature bends,
  not the gate. Optimize for founder trust over agent autonomy every time.
- The 10x rebuild's purpose is **convergence**: one engine layout (`lib/engine/`),
  one data layer (`lib/data/`), one auth pattern. Any change that adds a second
  way to do something already done once is moving backwards, even if it works.
- The audit-findings file is a **map of where this codebase rots**: auth scoping,
  secret-gated crons, raw JSON leaking to UI. New code in those areas deserves
  double scrutiny.
- Prefer boring: small diffs, exemplar-copying (worker route for auth,
  suggested-actions for contracts), append-only migrations. Cleverness in the
  engine or shim has repeatedly caused the worst bugs.
