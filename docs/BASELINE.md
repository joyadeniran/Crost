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

- **`// KNOWN-BUG(phase-1)`** — `lib/knowledge/extract-text.ts`, `extractSpreadsheet()`: the `catch` branch (low confidence + `"Spreadsheet parse failed"` warning) is effectively unreachable in practice. SheetJS's `XLSX.read()` is lenient across its format detectors and does not throw on garbage or empty buffers — it silently returns a workbook with zero sheets instead. Characterized in `tests/unit/extract-text.test.ts`. Not fixed this phase (behavior-preserving characterization only); worth tightening validation (e.g. reject empty/zero-sheet workbooks explicitly) in a later phase.

## SPEC-DRIFT found during Phase 1 (T7)

- **`// SPEC-DRIFT(§T7)`** — `app/api/goals/[id]/tasks/[taskId]/route.ts`: `docs/TEST_SPEC_10X.md` lists this route as `[dual]` (session OR `x-crost-internal-secret`), but the implementation only checks session auth (`createSupabaseServerComponentClient`) — there is no internal-secret branch. Characterized in `tests/unit/goals-task-patch.test.ts`. Not fixed this phase; if the route is meant to be callable by the worker/internal callers, that's a real gap worth closing in Phase 2/3.

## Exit gate status

- [x] `docs/BASELINE.md` exists (this file).
- [x] Type-check and unit-test baseline recorded, both green.
- [ ] `npm run build` confirmed green — **deferred**, sandbox cannot run a >45s foreground command; see note above. Not blocking Phase 1 start.
