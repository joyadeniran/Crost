---
name: crost
description: Institutional memory for Crost — a human-in-the-loop AI Company OS (Orc Chief-of-Staff + department agents on Google ADK/Gemini, Next.js on Cloud Run, Cloud SQL, GCS, Firebase Auth). Activate for ANY task in this repo — features, bugs, tests, refactors, routes, worker, approvals, artifacts, KB, onboarding, security, or the 10x rebuild plan. Encodes load-bearing invariants, known-fixed bugs, and the file map.
---

# Crost — Institutional Memory

## Product model (30 seconds)

Founder submits ONE goal → **Orc** (Chief of Staff, `LlmAgent`, Gemini 2.5 Flash via Vertex) plans 3–5 tasks → delegates to **Department agents** (Marketing/Engineering/Sales/Operations — rows in Cloud SQL, spawned dynamically) → departments produce **artifacts** (GCS) and **memos** (company state, Cloud SQL) → Orc synthesizes a **Mission Report** → SSE-streamed to founder. Any external action (send email, post, pay) creates an **approval request**; nothing external executes without founder approval. "Not a chatbot. An office."

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
- **ADK layer:** `lib/adk/{agents,tools,runner}.ts` + `app/api/adk/route.ts` — Google ADK `LlmAgent` tree, 7 `FunctionTool`s (zod-validated), `GcsArtifactService`. `app/api/mcp/route.ts` — MCP server, exactly 5 tools (`crost_run_goal`, `crost_get_goal_status`, `crost_search_knowledge`, `crost_list_departments`, `crost_get_memos`).
- **Decisioning:** `lib/orc-decision-gate.ts` (response-mode gate + context cache — remember `invalidateOrcContextCache`), `lib/risk-assessor.ts`, `lib/output-classifier.ts`, `lib/capability-checker.ts`, `lib/model-routing.ts`, `lib/key-resolver.ts` (BYO keys).
- **Tools:** `lib/tools/execute-tool-call.ts` (`DEPARTMENT_TOOL_RULES` allowlist per department), `lib/tools/parameter-resolver.ts` (drafts email bodies from intent), `lib/google/{gmail,oauth,auth}.ts` — NATIVE Google tools (Composio is dead/legacy; `lib/composio-*.ts` and `lib/tools/providers/composio.ts` are vestigial).
- **Artifacts:** `lib/artifact-transformers/` (7 transformers + `heal-payload.ts` + dispatch `index.ts`), `lib/gcs.ts`, routes `app/api/artifacts/*` incl. `make-changes` (versioning) and `download` (signed URL).
- **Data:** `lib/db.ts` (pg Pool + `createDbClient()` — a Supabase-API-compatible SHIM over raw pg; see gotchas), `lib/supabase.ts`/`supabase-browser.ts` (auth). Target state: typed repos in `lib/data/`.
- **Worker:** `scripts/worker.ts` (poll → claim → execute loop) + `app/api/worker/execute/route.ts` (dual-mode auth exemplar).
- **Product features:** `lib/suggested-actions.ts` + `execute-suggested-action.ts` (spec §6.1 canonical contract), `lib/recurring-missions.ts`, `lib/company-memo.ts`, `lib/orc-learning.ts`, `lib/calendar-prep.ts`, `lib/knowledge/extract-text.ts`.
- **Infra utils:** `lib/{api-response,errors,idempotency,rate-limit,cost-tracker,cost-table,usage-logger,crypto,refresh-token}.ts`, `middleware.ts` (50MB cap, 413).
- **Tests:** `frontend/tests/unit/` (vitest, mocks in `setup.ts`), `frontend/tests/e2e/` (playwright, `fixtures/llm-mocks.ts`), legacy `frontend/__tests__/`.
- **Schema:** `cloudsql_migration.sql` (full) + `cloudsql_fixes_*.sql` (append-only patches). Deploy: `cloudbuild.yaml`, `frontend/Dockerfile`, `gcp-setup.sh`.

## Load-bearing invariants

1. **Dual-mode auth pattern** (memorize it): routes serve either a session user (`auth.getUser()` → use `user.id`, add `.eq('created_by', user.id)`) OR a trusted internal caller (`x-crost-internal-secret` header — historically `SUPABASE_SERVICE_ROLE_KEY`, migrating to `WORKER_INTERNAL_SECRET`). Body-supplied `userId` is ONLY valid with the secret. Exemplar: `app/api/worker/execute/route.ts`.
2. **Approval gate:** external actions require an approved `approvals` row first. `approvals/expire` cron must return 500 if its secret env is unset — `if (cronSecret)` skip-auth was audit finding #7.
3. **Artifact immutability & GCS:** approved artifacts never mutate ("Make Changes" = new version, §9.4). Bucket is PRIVATE — signed URLs for download; do not double-prefix the GCS object path (fixed in d32b0ca).
4. **KB results are humanized:** never return raw `{matches:[...]}` JSON to UI/agent output (finding #9). Internal KB fetches from worker context must send the internal-secret header or they silently 401.
5. **Department tool allowlist:** `DEPARTMENT_TOOL_RULES` gates which tools each department may call. Don't bypass.
6. **Cross-user access returns 404** (not 403). Ownership scoping on every update site too — `goals/[id]/dialogue` had 3 unscoped updates (finding #8).

## Mistakes a smaller model WILL make here (checked against real history)

Each of these has happened or nearly happened. Check your diff against every line.

- **Copying a route without the ownership filter.** Every user-facing query AND
  update needs `.eq('created_by', user.id)`. Reads without it leak data; updates
  without it let users mutate others' rows (finding #8 was exactly this).
- **Accepting `userId` from the request body** on a session-authed path. Body
  `userId` is valid ONLY when the internal-secret header is present.
- **Wiring a new integration through Composio** because `lib/composio-*.ts` looks
  alive. It is dead. Native Google (`lib/google/*`) is the pattern.
- **Adding a query operator to the `createDbClient()` shim without a test.** The
  shim hand-parses operators; an unparsed operator fails silently or hangs
  (53bfe0c was an operator bug).
- **Fetching KB internally without the internal-secret header** — silent 401,
  agent gets empty context, output quietly degrades. Hard to spot in review.
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
- **Google OAuth is origin-aware:** redirect URIs must work on both `*.run.app` and `app.crosthq.com` (f2d4bfc). Offline access/refresh tokens stored in Cloud SQL, auto-refreshed (6f87072).
- **Email bodies are drafted from intent** in `parameter-resolver.ts` (e596c06) — don't send empty bodies.
- **Composio is dead.** Real Gmail send is native (`lib/google/gmail.ts`, c4801d8). Don't wire new tools through Composio.
- **Vertex model 404s** if model string drifts; model/schema parity fixed in 89782cc. Model config: `CLOUD_MODEL` env, default `gemini/gemini-2.5-flash`, per-department overrides via settings/models.
- **Two DB access styles coexist** (supabase-js for auth'd routes, pg shim for worker/engine). Don't add a third; 10x plan converges on `lib/data/` repos.
- Root is littered with historical review docs (`Spec_Review_v*.md`, audit reports) — reference only; the live ones are SPEC, MASTER, plan, test spec.
- `.env.example` is the env contract; real secrets in `.env`/Secret Manager — never read or commit them.

## Working protocol

Type-check + unit tests green before every commit (`cd frontend && npm run type-check && npm run test:unit`). Test-first for behavior changes (contracts in `docs/TEST_SPEC_10X.md`). Append a session summary to `CROST_MASTER.md` when done. Migrations are append-only new `cloudsql_fixes_*.sql` files. Target branch: `feature/gcp-challenge` → `main`.

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
