# Crost Behavioral Test Catalog (TEST_SPEC_10X)

Contract for Phase 1 characterization tests. Each item = one or more `it()` blocks. Capture CURRENT behavior (read the source, assert what it does). Framework: vitest, `frontend/tests/unit/`. Mocks: follow `tests/unit/setup.ts`; never hit network/DB/LLM. Extend existing test files where present (risk-assessor, orc-decision-gate, artifact-transformers, execute-tool-call, worker-execute, llm-client, etc. already have partial suites — ADD, don't duplicate).

Spec refs = `CROST_SPEC.md` sections. Where code and spec disagree, test the CODE and tag `// SPEC-DRIFT(§n)`.

## T1 — Pure decision logic

**T1.1 `lib/risk-assessor.ts` — `assessGoalRisk`**
- Returns RiskAssessment for: external-action keywords (email/send/post/publish/pay), internal-only goals, empty/whitespace input, mixed-risk goals. Assert risk level, reasons array, and approval-required flag for each branch visible in source.

**T1.2 `lib/orc-decision-gate.ts`**
- `orcDecisionGate`: each OrcResponseMode branch (direct answer vs plan vs clarify etc. — enumerate from the type) with mocked context/LLM.
- `fetchOrcContext` caching + `invalidateOrcContextCache` actually invalidates.
- `formatOrcContextForPrompt` / `formatKbContextForPrompt`: empty rows, populated rows, truncation behavior.
- `seedOrcContextFromMemo`: writes expected rows from a memo fixture; no-op cases.
- `enrichWithKnowledgeBase`: match/no-match/error paths.

**T1.3 `lib/llm-client.ts` parsers** (post-Phase-2: `lib/engine/parse.ts`)
- `extractJsonObject`: valid object, nested braces, braces-in-strings, unterminated, fromIndex offset, no object → null.
- `parseApprovalRequest`: valid approval JSON, malformed → null, blocked marker → `'BLOCKED'`, approval embedded in prose.
- `parseOrchestratorResponse`: task-plan JSON, plain text, fenced code blocks, garbage.
- `normalizeClarification`: null/undefined/empty/whitespace/normal.

**T1.4 `lib/output-classifier.ts`, `lib/capability-checker.ts`** — every exported classifier/checker: each category branch + fallback/default.

## T2 — Tool execution layer

**T2.1 `lib/tools/execute-tool-call.ts`**
- `DEPARTMENT_TOOL_RULES`: assert the exact allowlist per department (snapshot).
- `executeToolCall`: disallowed tool for department → rejected; KB search result is humanized text (never raw `{matches:[...]}` JSON — finding #9); internal fetches carry `x-crost-internal-secret`; unknown tool; provider error propagation.

**T2.2 `lib/tools/parameter-resolver.ts`** — email draft: body drafted from intent (commit e596c06 behavior), recipient/subject extraction, missing-param behavior.

**T2.3 `lib/google/gmail.ts`, `lib/google/oauth.ts`** (extend `gmail.test.ts`, `google-oauth.test.ts`) — send path builds correct RFC822/base64url; token refresh on expiry; refresh-token persistence; origin-aware redirect URI (commit f2d4bfc: run.app AND app.crosthq.com).

## T3 — Artifact lifecycle (spec §9, §9.4)

**T3.1 Transformers `lib/artifact-transformers/*`** — for each of code/document/email/excel/image/markdown/pptx: happy path produces expected output type; malformed input; `heal-payload.ts` healing behaviors; `index.ts` dispatch by type + unknown type; transformer failure surfaces `transformFailed` (finding #15).

**T3.2 Status model** (extend `artifact-lifecycle.test.ts`) — allowed transitions per §9.4 (draft→pending_approval→approved/rejected etc. — enumerate from code); immutability: approved artifact content never mutated, Make Changes creates new version; GCS path not doubled (commit d32b0ca regression test); download from private bucket signs URL.

## T4 — Goals / missions / approvals (spec §6, §7)

- Goal creation defaults (status, created_by scoping).
- Dispatch: creates tasks, sets statuses; double-dispatch currently? (test actual — likely KNOWN-BUG until Phase 3).
- Approval flow: `request_human_approval` writes row; approve → execution proceeds; reject → task terminal; expiry cron (`/api/approvals/expire`) requires secret ALWAYS, returns 500 if env unset (finding #7), expires only overdue rows.
- Mission report `runOrcReport`: composes from memos/tasks; goal marked completed.
- `lib/suggested-actions.ts` + `lib/execute-suggested-action.ts` (extend existing tests): catalog membership (§6.1), lifecycle/dismissal, execution contract.
- `lib/recurring-missions.ts` (extend): schedule computation, next-run, dedup.

## T5 — Memo & knowledge base (spec §8)

- `lib/company-memo.ts`: write/append rules, section structure, memo brief truncation (`getMemoBrief` char limits).
- KB: `lib/knowledge/extract-text.ts` per file type (pdf/docx/txt); search route dual path (ILIKE fallback vs `match_kb_chunks` RPC); upload constraints: 50MB cap, MIME whitelist, 10/hr rate limit (finding #14).

## T6 — Infra utilities

- `lib/idempotency.ts`: same key twice → second returns cached/skips; different keys independent; TTL/expiry if present.
- `lib/rate-limit.ts`: under/at/over limit; window reset; per-user isolation.
- `lib/api-response.ts`: `apiOk`/`apiError` shapes incl. `_metadata` (finding #16).
- `lib/errors.ts`: error classes, status mapping.
- `lib/cost-tracker.ts` + `lib/cost-table.ts` (extend): per-model cost math, token accounting, `checkTokenBudget` thresholds.
- `lib/crypto.ts`: encrypt/decrypt roundtrip, tamper → error.
- `lib/model-routing.ts`, `lib/key-resolver.ts`: routing per department/user config; BYO-key resolution precedence.

## T7 — Route auth matrix (the security lock)

For EACH route below, three tests: (a) no session → 401; (b) session but other user's resource → 404/403; (c) owner → 2xx. Rows marked [dual] also: valid `x-crost-internal-secret` + body userId → 2xx; invalid secret → falls through to session auth.

| Route | dual |
|---|---|
| `knowledge/search`, `knowledge/read` | [dual] |
| `goals/[id]/report` | [dual] |
| `goals/[id]/dispatch`, `goals/[id]/tasks/[taskId]`, `approvals/[id]` | [dual] |
| `worker/execute` | [dual] (secret REQUIRED) |
| `connect`, `departments/[slug]/reset`, `settings/tools`, `settings/tools/config`, `config/secret-presence`, `goals/[id]/dialogue` (all 3 update sites scoped), `approvals/expire` (cron secret mandatory), `goals`, `artifacts/*`, `memos`, `departments/*`, `recurring-missions/*`, `suggested-actions/*`, `calendar-events/*`, `usage/*`, `onboarding/*` | — |

Also: middleware 50MB body cap → 413 (finding #18); `Idempotency-Key` dedupe on creation POSTs (finding #17).

Route tests: import the route handler, call with mocked `NextRequest` + mocked supabase/pg (pattern in existing `worker-execute.test.ts`).

## T8 — Worker & orchestrator loop

- `scripts/worker.ts`: claims queued task; executes via engine; success → status done + result persisted; LLM error → current retry/failure behavior (assert actual; tag KNOWN-BUG if tasks can be double-claimed or stuck); polling interval/backoff.
- `runOrchestratorTask`: plans 3–5 tasks from goal (mock LLM); handles clarification mode; assistant-mode does not hang (commit 53bfe0c regression: `.or()`/`.not()` shim operator parsing).
- `runWorkerTask`: tool-call loop, approval interrupt (returns pending state), artifact upload path, memo write on completion.
- ADK layer `lib/adk/{agents,runner,tools}.ts`: agent tree construction (Orc + dynamic sub-agents from DB rows), each FunctionTool's zod schema validates good/bad input, runner session wiring.
- `/api/mcp`: GET lists exactly the 5 tools; `tools/call` dispatches each; unknown method/tool errors.
- `/api/adk`: GET capabilities shape; POST creates goal + streams (mock runner).

## T9 — E2E (Playwright, Phase 5)

Extend `tests/e2e/`: onboarding Beats 1–10 (§2 of spec); goal→plan→approve→artifact waterfall (exists: `waterfall-lifecycle.spec.ts` — extend); auth-security (exists); approval reject path; artifact download; demo page loads. All LLM calls via `fixtures/llm-mocks.ts`.

## Coverage targets
Phase 1 exit: modules in T1–T6 ≥80% lines; T7 matrix complete for every listed route; T8 core paths covered. Snapshot tests acceptable only for prompt-builder outputs and DEPARTMENT_TOOL_RULES.
