# BASELINE — Phase 0

Recorded 2026-07-02, branch `feature/gcp-challenge`, in the execution sandbox (Node v22.22.3, npm 10.9.8, 4 vCPU / 3.8GB RAM).

## `npm run type-check` — ✅ CLEAN

```
tsc --noEmit
```
Exit 0. No output, no errors.

## `npm run test:unit` — ✅ ALL GREEN

```
Test Files  21 passed (21)
     Tests  367 passed (367)
  Duration  41.70s
```

No failures. Files covered: `e2e-flows`, `risk-assessor`, `phase5-refinement`, `recurring-missions`, `db`, `gemini-client`, `cost-tracker`, `calendar-prep`, `artifact-lifecycle`, `suggested-actions`, `google-oauth`, `execute-tool-call`, `utils-errors`, `gmail`, `llm-client`, `orc-learning`, `worker-execute`, `artifact-transformers`, `orc-decision-gate`, `edge-cases`, `capability-checker` (all under `tests/unit/`).

Note: legacy `__tests__/artifact-lifecycle.test.ts` and `__tests__/suggested-actions.test.ts` exist but are **not** included by `vitest.config.ts` (`include: ['tests/unit/**/*.test.ts']`) — pre-existing, not a Phase 0 regression. Consider consolidating in Phase 1/2 (extend the `tests/unit/` versions, don't duplicate).

Some tests intentionally log caught errors to stderr as part of asserting fail-open/error-handling behavior (`phase5-refinement.test.ts` DB-error path, `capability-checker.test.ts` fail-open path, `worker-execute.test.ts` BUG-6 catch-all). These are expected stderr, not failures.

## `npm run build` — ⚠️ UNVERIFIED (sandbox time-limit, not a code failure)

`next build` (Next.js 14.2.35) was run 7 times against this environment. Every run was killed by an external timeout (max single-command budget in this sandbox is 45s, and background/detached processes do not survive between tool invocations — confirmed by process-namespace teardown). In every attempt:
- The process was actively consuming CPU (~30% of one core) and RAM (growing), i.e. genuinely compiling, not deadlocked.
- No error output was ever produced — only the standard startup banner (`▲ Next.js 14.2.35 — Environments: .env.local`) before the timeout hit.
- `.next/cache` stayed at a constant 332M (a pre-existing cache from an April build) across attempts — build never got far enough to touch it in the available window.
- Ruled out network-hang as the cause: `output: 'standalone'`, 75/89 routes are `force-dynamic`, no `generateStaticParams`/`getStaticProps` found, telemetry disabled — nothing at build time should block on outbound network.

Given `next.config.js` sets `typescript.ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true`, and `tsc --noEmit` is independently clean, a build failure is unlikely — but this is **not confirmed**. Recommend the person (or CI) run `npm run build` locally / in CI where there's no 45s per-command ceiling, and report back if it fails. Do not treat this as a Phase 0 blocker for starting Phase 1 (pure-logic characterization tests don't need a successful build), but revisit before the Phase 6 merge gate.

## Known baseline facts for later phases

- `frontend/lib/llm-client.ts` exists as the pre-refactor god module (Phase 2 target).
- `next.config.js` has an "Invalid next.config.js options" warning for `serverExternalPackages` (unrecognized key on this Next version) — cosmetic warning only, does not fail the build. Worth fixing in Phase 2/4 config cleanup (likely should be `experimental.serverComponentsExternalPackages` on 14.2.x, or the key name needs updating for whatever Next version is actually pinned).
- No KNOWN-BUG tags found yet — Phase 1 will surface these as characterization tests are written against current (possibly buggy) behavior.

## KNOWN-BUGs found during Phase 1

- **`// KNOWN-BUG(phase-1)`** — `lib/knowledge/extract-text.ts`, `extractSpreadsheet()`: the `catch` branch (low confidence + `"Spreadsheet parse failed"` warning) is effectively unreachable in practice. SheetJS's `XLSX.read()` is lenient across its format detectors and does not throw on garbage or empty buffers — it silently returns a workbook with zero sheets instead. Characterized in `tests/unit/extract-text.test.ts`. **RESOLVED (Phase 6)**: confidence is now downgraded to `'low'` with a warning whenever no sheet produces non-empty content, detected explicitly rather than relying on `XLSX.read()` throwing. Test updated to assert the corrected behavior.

## SPEC-DRIFT found during Phase 1 (T7)

- **`// SPEC-DRIFT(§T7)`** — `app/api/goals/[id]/tasks/[taskId]/route.ts`: `docs/TEST_SPEC_10X.md` lists this route as `[dual]` (session OR `x-crost-internal-secret`), but the implementation only checks session auth (`createSupabaseServerComponentClient`) — there is no internal-secret branch. Characterized in `tests/unit/goals-task-patch.test.ts`. **Investigated in Phase 6, deliberately left as session-only**: grepped the full repo for any internal/worker caller of this route — none exists; the only caller is `components/war-room/WarRoom.tsx`, a founder-initiated session request. Sibling `[dual]` routes (`goals/[id]/dispatch`, `approvals/[id]`) derive ownership from the resource row itself when called internally (no client-supplied `userId` needed) — this route could follow the same pattern, but building an internal-secret bypass with no actual internal caller today would add auth surface without a matching, testable need. `docs/TEST_SPEC_10X.md`'s `[dual]` listing for this specific route appears to be aspirational/copied from its siblings rather than reflecting a real requirement. Left open: either correct the test spec's catalog entry to session-only, or add dual-mode support if/when a real internal caller (e.g. the worker's reaper) needs it.

## Exit gate status

- [x] `docs/BASELINE.md` exists (this file).
- [x] Type-check and unit-test baseline recorded, both green.
- [ ] `npm run build` confirmed green — **deferred**, sandbox cannot run a >45s foreground command; see note above. Not blocking Phase 1 start.


## Beta migration (Vercel + Supabase) — notes

- **Schema drift found while building the baseline** (`supabase/migrations/20261001000000_crost_beta_baseline.sql`):
  the Cloud SQL schema was an incomplete port. Columns the code writes/reads but the old schema never
  had are now in the baseline: `departments.is_orchestrator/orc_persona_id`, `goals.orc_conversation/orc_notes`,
  `company_memos.task_id/is_current_context/is_foundational/valid_until/version_tag`,
  `suggested_actions.completed_at/dispatched_at/failed_reason/result_summary`,
  `connections.access_token/refresh_token/token_expires_at/scopes`,
  `capability_inventory.availability_status/skill_tags/notes`. Also widened: `event_log.event_type` (CHECK dropped —
  code emits `tool_executed`, `provider_fallback`, `goal_completed`, …) and `artifacts.artifact_type`
  (`presentation`, `pdf`).
- **Latent bug (fixed by the baseline):** `lib/capability-checker.ts` selected `availability_status`, `skill_tags`, `notes`
  which did not exist, so capability-gap detection silently returned nothing in production.
- **Behaviour changes:** cross-user `PATCH /api/approvals/[id]` now returns 404 (was 403); `GET /api/departments?scope=templates`
  now requires a session; the executor now sends canonical `send_email` approvals through Gmail (previously only `gmail_*`).
- **Known follow-ups:** the `createDbClient()` shim is still hand-rolled (a typed `lib/data/` layer remains the 10x goal);
  `ignoreDuringBuilds` for ESLint is on because `.eslintrc` has no `@typescript-eslint` plugin — run `npm run lint` separately.
