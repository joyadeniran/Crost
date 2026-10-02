# CLAUDE.md

Guidance for Claude when working in this repository.

## Start here, every session

1. Read `.claude/skills/crost/SKILL.md` — institutional memory: invariants, gotchas, file map. Do NOT re-explore the repo from scratch.
2. For the 10x rebuild effort: `docs/DEVELOPMENT_PLAN_10X.md` (phased plan, exit gates) and `docs/TEST_SPEC_10X.md` (test contracts). Deploying: `docs/DEPLOY_VERCEL.md`.
3. Source of truth for product behavior: `CROST_SPEC.md`. Implementation history: `CROST_MASTER.md` — append a summary entry after every completed work session.

## What Crost is

Human-in-the-loop Company OS — **beta = one loop**: a founder submits a goal; **Orc** (Chief-of-Staff agent, Gemini via the Google AI API) plans 3–5 tasks, delegates to four fixed Department agents (Marketing/Engineering/Sales/Operations, cloned per founder from global templates), which produce artifacts and memos; the founder approves; done. **Every external action (email, post, payment) requires founder approval first.** Stack: one Next.js 14 app on **Vercel** (marketing site at `/`, product at `/app`), **Supabase** (Auth + Postgres + private Storage bucket). No Google Cloud infrastructure. Cut from the beta (don't re-add without asking): MCP server, bring-your-own keys, recurring missions, calendar prep, knowledge base, dynamic departments, Composio, ADK/Vertex, the polling worker.

## Commands (run from `frontend/`)

```
npm run dev            # local dev
npm run type-check     # tsc --noEmit — must pass before any commit
npm run test:unit      # vitest (tests/unit/ + __tests__/)
npm run test:e2e       # playwright (tests/e2e/, LLM mocked via fixtures/llm-mocks.ts)
npm run lint && npm run build
npm run test:integration   # real Postgres: TEST_DATABASE_URL=postgres://.../scratch_db (applies the baseline migration itself)
```
No separate worker: work runs inside route handlers via `waitUntil` (`lib/background.ts`); `lib/engine/supervisor.ts` is the stateless safety net behind `/api/cron/supervise` (crons in `frontend/vercel.json`). DB schema: `supabase/migrations/` — single baseline `20261001000000_crost_beta_baseline.sql`, then append-only new files (never edit an applied migration). Pre-beta schemas/infra are archived in `archive/gcp-legacy/` and `supabase/legacy/`.

## Hard invariants (violating these is a P0 bug)

- **Auth on every route.** Session user via Supabase Auth (`lib/auth/guard.ts` → `createSupabaseServerComponentClient`), or `x-crost-internal-secret` header for trusted worker/cron calls (dual-mode pattern: see `app/api/worker/execute/route.ts`). NEVER trust `userId` from request body without the internal secret.
- **Ownership scoping.** Every user-data query filters `created_by = user.id` (or `user_id`). Cross-user access → 404, not 403.
- **Approval gate.** No external action executes without an approved `approvals` row. Every cron route uses `lib/auth/cron.ts` (`requireCronSecret`) and must HARD-FAIL (500) if `CRON_SECRET` is unset.
- **Artifact immutability.** Approved artifacts are never mutated; "Make Changes" creates a new version. The Storage bucket (`crost`) is private; downloads stream through `/api/artifacts/[id]/download` after an ownership check; don't double-prefix object paths (`lib/storage.ts`).
- **RLS is ON with no policies** for every table; the app reaches Postgres via `DATABASE_URL` (privileged) and enforces ownership in code. `anon` may only INSERT into `waitlist`. A new table must `ENABLE ROW LEVEL SECURITY` and `REVOKE ALL ... FROM anon, authenticated` (the baseline's DO-block does this for tables that exist when it runs — repeat it in new migrations).
- **Stored secrets are sealed** (`lib/crypto.ts`, `TOKEN_ENCRYPTION_KEY`) — never write an OAuth token in plaintext; storing fails closed without the key.
- **Background work uses `runInBackground`/`triggerDispatch`** (`lib/background.ts`) — a bare un-awaited promise is killed when a Vercel function returns.
- **Responses** via `apiOk`/`apiError` (`lib/api-response.ts`). Errors from `lib/errors.ts` taxonomy.
- **Egress.** Supabase egress is the project-killer (see `docs/EGRESS.md`). Never use PostgREST/Realtime or add a polling loop; list queries use explicit columns + `.limit()`; new `select('*')` fails `egress-static.test.ts`; client polling goes through `lib/polling.ts` against a tiny status route; label routes with `withEgressLabel`, gate heavy reads with `guardRead`.
- **Idempotency-Key** honored on duplicate-prone POSTs; middleware enforces 50MB body cap.

## Workflow rules

- Test-first: behavior changes require a test (see `docs/TEST_SPEC_10X.md` conventions). Extend existing test files; never delete tests.
- Never commit failing tests or type errors. Commit prefixes: `feat:`/`fix:`/`refactor:`/`test:`/`docs:`.
- Don't touch `.env*` values, don't deploy, don't change route paths/response shapes without a characterization test of the old shape first.
- Known-bug convention: `// KNOWN-BUG(phase-N):` in tests asserting current-but-wrong behavior; also log in `docs/BASELINE.md`.
- A `code-review-graph` MCP may be available (see AGENTS.md) — prefer it over Grep for structural queries when connected.

## Layout

`frontend/app/(marketing)` landing/pricing/legal (own CSS, rendered via `components/marketing/*`; `BridgeScroll.tsx` is the hero) · `frontend/app/(product)` login/signup · `frontend/app/app/*` product (`(shell)` = dashboard layout, `onboarding/` = 3-step flow) · `frontend/app/api/*` routes · `frontend/lib/` core logic (`llm-client.ts` barrel → `lib/engine/{model,prompt,parse,orchestrator,worker,supervisor,...}.ts`; `gemini-client.ts`; `supabase.ts` server facade over pg `db.ts` + Supabase Auth/Storage; `storage.ts`; `tools/execute-tool-call.ts` = approval gateway; `artifact-transformers/`; `google/` = native Gmail/OAuth) · `frontend/tests/` unit + integration + e2e. Detailed map + gotchas: the crost skill.
