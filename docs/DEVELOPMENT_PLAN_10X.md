# Crost 10x Development Plan (Test-First Refactor In Place)

**Branch:** `feature/gcp-challenge` → merge to `main` when Phase 6 gate passes.
**Approach:** Old version = spec. Lock behavior with tests FIRST, then refactor until green. Same stack (Next.js + Google ADK + Gemini/Vertex + Cloud SQL + GCS + Firebase).
**Companion docs:** `docs/TEST_SPEC_10X.md` (the test catalog — your test-writing contract), `CLAUDE.md` (repo rules), `.claude/skills/crost/SKILL.md` (institutional memory — READ FIRST).

## Operating protocol for the executing model (non-negotiable)

1. Read `.claude/skills/crost/SKILL.md`, then this file, then the relevant section of `docs/TEST_SPEC_10X.md` for the phase you're on. Do NOT re-explore the repo from scratch — the file map is in the skill.
2. Work one phase at a time, in order. Each phase has an EXIT GATE — a set of commands that must pass. Do not proceed with a red gate.
3. TDD loop per unit of work: write/extend tests from TEST_SPEC → run (`npm run test:unit` in `frontend/`) → confirm red where expected → implement → green → `npm run type-check` → commit.
4. Commit per completed sub-task: `test:`, `refactor:`, `fix:`, `feat:` prefixes. Never commit with failing tests or type errors.
5. After each phase, append a short entry to `CROST_MASTER.md` (version bump, what changed).
6. NEVER: change public API route paths or response shapes without a characterization test proving old shape first; touch `.env*` secrets; deploy; delete existing tests (extend them); modify DB schema except via a new SQL file in root pattern `cloudsql_fixes_*.sql`.
7. If blocked >30 min on one item, note it in `CROST_MASTER.md` under "Open Items" and move on.

## Phase 0 — Baseline (½ day)

- `cd frontend && npm install && npm run type-check && npm run test:unit` — record every failure verbatim in `docs/BASELINE.md` (create it). These are pre-existing; do not fix yet.
- `npm run build` must succeed. If not, fix ONLY what blocks build, minimally.
- **Exit gate:** build passes; `docs/BASELINE.md` exists listing baseline test/type status.

## Phase 1 — Behavioral lock: characterization tests (2–3 days)

Implement `docs/TEST_SPEC_10X.md` sections T1–T8 as vitest tests under `frontend/tests/unit/` (extend existing files where one exists for the module). Mock Supabase/pg/fetch/LLM — pattern exists in `frontend/tests/unit/setup.ts` and `tests/e2e/fixtures/llm-mocks.ts`.

Priority order (pure logic first — cheapest, highest value):
1. `lib/risk-assessor.ts`, `lib/orc-decision-gate.ts` (parsing/formatting fns), `parseApprovalRequest` + `extractJsonObject` in `lib/llm-client.ts`
2. `lib/artifact-transformers/*` (all 7), `lib/tools/parameter-resolver.ts`, `lib/tools/execute-tool-call.ts` (DEPARTMENT_TOOL_RULES + KB humanization)
3. `lib/idempotency.ts`, `lib/rate-limit.ts`, `lib/api-response.ts`, `lib/errors.ts`, `lib/capability-checker.ts`, `lib/output-classifier.ts`
4. Route auth contracts (T7): every route in the auth matrix returns 401 unauthenticated, 404 cross-user, 200 owner, and honors `x-crost-internal-secret` dual-mode where listed
5. `scripts/worker.ts` claim/execute/retry loop (T8) with mocked DB

Rule: tests capture what the code DOES today, not what it should do. If current behavior is a bug, write the test asserting current behavior with a `// KNOWN-BUG(phase-N):` comment, and list it in `docs/BASELINE.md` for the later phase.

- **Exit gate:** all new tests green against UNCHANGED source; `npm run test:unit` green (minus documented baseline failures); coverage report (`test:unit:coverage`) shows the listed modules ≥80% line coverage.

## Phase 2 — Architecture refactor (3–4 days) — the core of "10x"

Refactor with tests as the safety net. After EVERY move: type-check + unit tests green.

2.1 **Split the god module.** `frontend/lib/llm-client.ts` (1744 lines) → `lib/engine/`:
   - `engine/model.ts` (getModel, CLOUD_MODEL, callLiteLLM, callLLM, callEmbeddings)
   - `engine/prompt.ts` (buildFinalPrompt, buildOrcContext, getModeInstructions, formatConversationHistory)
   - `engine/parse.ts` (parseApprovalRequest, extractJsonObject, parseOrchestratorResponse, normalizeClarification)
   - `engine/orchestrator.ts` (runOrchestratorTask, runOrcReport), `engine/worker.ts` (runWorkerTask)
   - `engine/memo.ts` (getMemoBrief, getMemos, saveContextMemo), `engine/budget.ts` (checkTokenBudget), `engine/events.ts` (logEvent)
   - Keep `lib/llm-client.ts` as a re-export barrel so nothing else breaks; migrate imports opportunistically.

2.2 **Single data layer.** Today Supabase-client shims and raw `pg` (`lib/db.ts`) coexist. Create `lib/data/` typed repositories (goals, tasks, approvals, artifacts, memos, departments, kb, events, users/tokens) wrapping the ONE canonical client (`createDbClient()` / pool from `db.ts`). Routes and engine call repos, never raw queries. Migrate module-by-module; keep old paths working until the repo layer covers them.

2.3 **Central auth.** `lib/auth/guard.ts`: `requireUser(req)`, `requireInternal(req)` (WORKER_INTERNAL_SECRET), `requireUserOrInternal(req, {resource})`. Replace per-route copy-paste (the pattern in REMEDIATION_HANDOFF §2). Every route uses a guard — enforced by T7 tests.

2.4 **Uniform responses + env validation.** All routes return via `apiOk`/`apiError` from `lib/api-response.ts`. Add `lib/env.ts` with zod schema validating required env at boot; fail fast with a clear message.

- **Exit gate:** all Phase 1 tests still green with ZERO test edits (except import paths); type-check green; build green; `lib/llm-client.ts` <50 lines (barrel only); no route reads `userId` from request body without `requireInternal`.

## Phase 3 — Reliability 10x (2–3 days)

- **Worker durability:** `scripts/worker.ts` + `/api/worker/execute`: atomic task claim (`UPDATE ... WHERE status='queued' RETURNING` or `FOR UPDATE SKIP LOCKED`), bounded retries with backoff, dead-letter status `failed_permanent`, heartbeat/stale-task reaper. Tests in T8 extended to assert new behavior (update the KNOWN-BUG tests now).
- **State-machine integrity:** goal/task/approval/artifact status transitions as an explicit table in `lib/state-machine.ts`; illegal transitions rejected + logged. Tests T3/T4.
- **Idempotency everywhere:** `Idempotency-Key` honored on all duplicate-prone POSTs (already partially done — finding #17).
- **Structured logging:** one `lib/log.ts` (JSON lines: level, userId, goalId, taskId, module). Replace console.* in engine/worker/routes.
- **Exit gate:** T8 upgraded tests green; a simulated double-dispatch test proves no duplicate execution; full suite green.

## Phase 4 — Security completion (1–2 days)

From REMEDIATION_HANDOFF "Out of Scope" + finding #10:
- Rotate internal secret: introduce `WORKER_INTERNAL_SECRET` env, keep `SUPABASE_SERVICE_ROLE_KEY` fallback for one release, update `.env.example` + all 7 call sites (`grep -rn "x-crost-internal-secret" frontend/`).
- Security headers in `next.config.js`: CSP (report-only first), X-Frame-Options DENY, HSTS, nosniff.
- CSRF: origin-check middleware for state-changing methods (SameSite=Lax already partial).
- RLS audit: run the gap query from REMEDIATION_HANDOFF §"Out of Scope"; write `cloudsql_fixes_v14_rls.sql` for uncovered tables.
- **Exit gate:** T7 auth-matrix tests green including new secret; headers verified by a unit test on the config; suite green.

## Phase 5 — Product polish against CROST_SPEC.md (2–3 days)

- Verify Suggested Next Actions against spec §6.1 canonical contract (data model, catalog, lifecycle) — write tests from spec, fix drift.
- Mission Reports (§7) and Memo rules (§8) — same treatment.
- Artifact Sandbox Lifecycle (§9.4): status model, immutability/versioning, Make Changes workflow — tests then fixes.
- Playwright e2e: extend `tests/e2e/` to cover onboarding Beats 1–10 (§2) and waterfall lifecycle with LLM mocks (`fixtures/llm-mocks.ts`). Run with `npm run test:e2e`.
- **Exit gate:** e2e green locally; spec-drift items either fixed or logged in CROST_MASTER.md as deliberate deviations.

## Phase 6 — Verification & merge (1 day)

1. `npm run test:all && npm run type-check && npm run lint && npm run build` — all green.
2. Resolve every `KNOWN-BUG` comment: fixed (test updated) or documented.
3. Update `CROST_MASTER.md` (final entry), `ARCHITECTURE.md` (new module map), `.env.example`.
4. Push `feature/gcp-challenge`; open PR to `main` with summary: test counts before/after, modules refactored, security items closed. Merge on green CI (cloudbuild.yaml runs build).

## Sizing note
Phases 1–2 are the leverage. If time-boxed, ship Phases 0–3 + Phase 6 and log 4–5 as follow-ups.
