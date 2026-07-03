# CLAUDE.md

Guidance for Claude when working in this repository.

## Start here, every session

1. Read `.claude/skills/crost/SKILL.md` — institutional memory: invariants, gotchas, file map. Do NOT re-explore the repo from scratch.
2. For the 10x rebuild effort: `docs/DEVELOPMENT_PLAN_10X.md` (phased plan, exit gates) and `docs/TEST_SPEC_10X.md` (test contracts).
3. Source of truth for product behavior: `CROST_SPEC.md`. Implementation history: `CROST_MASTER.md` — append a summary entry after every completed work session.

## What Crost is

Human-in-the-loop Company OS. A founder submits one goal; **Orc** (Chief-of-Staff agent, Gemini via Vertex AI / Google ADK) plans 3–5 tasks, delegates to Department agents (Marketing/Engineering/Sales/Operations, loaded dynamically from DB), which produce artifacts and memos. **Every external action (email, post, payment) requires founder approval first.** Stack: Next.js (Cloud Run) + Cloud SQL Postgres + GCS + Firebase Auth + Secret Manager. MCP server at `/api/mcp` exposes 5 tools to external agents.

## Commands (run from `frontend/`)

```
npm run dev            # local dev
npm run type-check     # tsc --noEmit — must pass before any commit
npm run test:unit      # vitest (tests/unit/ + __tests__/)
npm run test:e2e       # playwright (tests/e2e/, LLM mocked via fixtures/llm-mocks.ts)
npm run lint && npm run build
```
Worker (repo root): `npm run worker` (scripts/worker.ts). DB schema: `cloudsql_migration.sql` + `cloudsql_fixes_*.sql` (append-only; never edit applied migrations).

## Hard invariants (violating these is a P0 bug)

- **Auth on every route.** Session user via Supabase auth helper, or `x-crost-internal-secret` header for trusted worker/cron calls (dual-mode pattern: see `app/api/worker/execute/route.ts`). NEVER trust `userId` from request body without the internal secret.
- **Ownership scoping.** Every user-data query filters `created_by = user.id` (or `user_id`). Cross-user access → 404, not 403.
- **Approval gate.** No external action executes without an approved `approvals` row. Cron expiry route must HARD-FAIL (500) if its secret env is unset.
- **Artifact immutability.** Approved artifacts are never mutated; "Make Changes" creates a new version. GCS bucket is private; downloads use signed URLs; don't double-prefix GCS paths.
- **Responses** via `apiOk`/`apiError` (`lib/api-response.ts`). Errors from `lib/errors.ts` taxonomy.
- **Idempotency-Key** honored on duplicate-prone POSTs; middleware enforces 50MB body cap.

## Workflow rules

- Test-first: behavior changes require a test (see `docs/TEST_SPEC_10X.md` conventions). Extend existing test files; never delete tests.
- Never commit failing tests or type errors. Commit prefixes: `feat:`/`fix:`/`refactor:`/`test:`/`docs:`.
- Don't touch `.env*` values, don't deploy, don't change route paths/response shapes without a characterization test of the old shape first.
- Known-bug convention: `// KNOWN-BUG(phase-N):` in tests asserting current-but-wrong behavior; also log in `docs/BASELINE.md`.
- A `code-review-graph` MCP may be available (see AGENTS.md) — prefer it over Grep for structural queries when connected.

## Layout

`frontend/app/api/*` routes · `frontend/lib/` core logic (`llm-client.ts` = orchestrator/worker engine, being split into `lib/engine/`; `adk/` = Google ADK agents/tools/runner; `tools/` = tool execution; `artifact-transformers/`; `google/` = native Gmail/OAuth) · `scripts/worker.ts` = task-executing worker · `frontend/tests/` unit + e2e. Detailed map + gotchas: the crost skill.
