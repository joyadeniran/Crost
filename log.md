# Changelog

All notable changes to Crost are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — ORC Orchestration Phase 4 Week 8 · 2026-05-18
> Branch: `claude/orc-phase4-calendar`

### Added
- **`lib/cost-tracker.ts`** — real-time cost tracking library:
  - `getBudgetConstraint(userId)` — reads `monthly_api_budget` from `orc_context` constraint rows (JSONB field or `$N` parsed from summary text). Returns null when unconfigured.
  - `classifyBudgetAlert(spent, limit)` — `ok` (<80%), `warning` (80–94%), `critical` (≥95%), `null` (no budget set).
  - `computeMonthlySpend(userId)` — aggregates `api_usage_logs` for the current UTC calendar month into `MonthlyCostSummary`: totalCostUsd, totalTokens, byModel (calls/tokens/costUsd), byProvider, budgetLimitUsd, budgetUsedPct, alertLevel. Fail-open on any error.
- **`app/api/usage/summary/route.ts`** — authenticated GET endpoint returning `MonthlyCostSummary` for the logged-in user.
- **`tests/unit/cost-tracker.test.ts`** — 22 unit tests: `classifyBudgetAlert` (all threshold boundaries), `getBudgetConstraint` (JSONB, text parse, no amount, errors), `computeMonthlySpend` (aggregation, all alert levels, no budget, fail-open, month string).
- **`tests/unit/e2e-flows.test.ts`** — 16 integration-style tests across 5 flows: budget alert injection (warning/critical/ok), calendar event type inference (6 title patterns), prep checklist goalPrompt coverage (investor_meeting, board_meeting), orc-learning outcome writes (completed, failed), recurring mission eligibility gate (5 conditions).

### Changed
- **`lib/llm-client.ts`** — `computeMonthlySpend` added as 5th entry in the `Promise.all` parallel pre-processing block of `runOrchestratorTask`. If `alertLevel` is `warning` or `critical`, a descriptive budget risk note is pushed into `riskAssessment.risk_notes` before `orcDecisionGate` — surfaces in the mode hint, plan card, and `orc_decision_log`.
- **`app/api/cron/calendar-sync/route.ts`** (security hardening):
  - Email addresses in Google Calendar attendee lists now validated with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` before insert (was `.filter(Boolean)` only).
  - Composio response parsed defensively: checks `.items`, `.events`, and raw array in sequence before defaulting to `[]`.
  - Raw `err.message` removed from API response body — error logged server-side, response returns `'sync_failed'` string.

---

## [Unreleased] — ORC Orchestration Phase 4 Week 7 · 2026-05-18
> Branch: `claude/orc-phase4-calendar`

### Added
- **`supabase/migrations/20260518000001_company_calendar_events.sql`** — `company_calendar_events` table: id, user_id, type (investor_meeting/customer_call/board_meeting/conference/deadline/other), title, date, duration_minutes, attendees, prep_required, related_goals, meeting_notes, outcomes, next_actions, source (manual|google_calendar), external_id. RLS + service_role bypass; unique index on (user_id, external_id) for sync dedup; date+user index; updated_at trigger.
- **`lib/calendar-prep.ts`** — three functions:
  - `getUpcomingEvents(userId, lookAheadDays=7)` — fetches events from DB within the look-ahead window, returns `[]` on any error.
  - `buildPrepChecklist(event)` — rule-based checklist per event type (PREP_TEMPLATES); items with `goalPrompt` are one-click launchable; merges `event.prep_required` without duplicating base items.
  - `getProactivePrepSuggestions(userId)` — combines both, computes `daysUntil` clamped to 0 by `Math.max`.
- **`app/api/calendar-events/route.ts`** — GET (list all or `?upcoming=true&days=N` window) + POST (create manual event, Zod-validated).
- **`app/api/calendar-events/[id]/route.ts`** — PATCH (update type/title/date/attendees/meeting_notes/outcomes/next_actions) + DELETE. Both owner-scoped via `.eq('user_id', user.id)`.
- **`app/api/cron/calendar-sync/route.ts`** — Daily CRON_SECRET-authed sync. Finds all users in `connections` table with `service_name = 'googlecalendar'`, calls `GOOGLECALENDAR_LIST_EVENTS` via `runComposioTool` for 30-day window, infers event type from title keywords, upserts on `(user_id, external_id)` conflict. Skips users whose Composio call fails (returns error in result, doesn't fail the batch).
- **`tests/unit/calendar-prep.test.ts`** — 17 unit tests covering `buildPrepChecklist` (all 6 types, prep_required merge, dedup, goalPrompt presence, priority values), `getUpcomingEvents` (data, DB error, throws, look-ahead window check), `getProactivePrepSuggestions` (daysUntil computation, past-event clamping, checklist present, empty case).

### Changed
- **`components/war-room/WarRoom.tsx`** — Added `CalendarPrepPanel` component: shows upcoming events with urgency colour-coded badges (today/tomorrow/in Nd) and action chips for items with goalPrompt. `GoalInput` gains `prefillSignal?: { value: string; ts: number }` prop — clicking an action chip fires `setGoalPrefillSignal({ value: prompt, ts: Date.now() })` in the parent, which GoalInput watches via a `useEffect` to set its textarea value and focus. Panel lazy-fetches `/api/calendar-events?upcoming=true&days=7` on War Room mount and is dismissible per session.
- **`types/index.ts`** — Added `CalendarEventType` union and `CalendarEvent` interface.

---

## [Unreleased] — ORC Orchestration Phase 3 Week 6 · 2026-05-17
> Branch: `claude/orc-phase3-recurring-missions`

### Added
- **`lib/orc-learning.ts`** — ORC self-improvement loop (three functions):
  - `writeOutcomeToDecisionLog(goalId, outcome, description?)` — stamps `outcome`, `outcome_description`, and `outcome_at` on any `orc_decision_log` rows for the goal that are still unresolved. Fire-and-forget safe; never throws.
  - `computeLearningInsights(userId, lookbackDays=7)` — aggregates resolved decisions into mode-level and risk-tier-level `ModeStats` (total, successful, failed, successRate), plus an overall success rate.
  - `adjustRecencyScores(userId, lookbackDays=7)` — nudges `orc_context.recency_score` based on recent outcomes: tier-1 success → +3 to matched preference/strategy rows; tier-1 fail with no flagged risk → −5 to matched preference rows; tier-2/3 fail with flagged risk notes → +2 to relevant constraint rows. Scores clamped to [10, 100]. Returns count of rows updated.
- **`app/api/cron/orc-learning/route.ts`** — Weekly CRON_SECRET-authed endpoint. Finds all distinct users with resolved decisions in the past 7 days, runs `computeLearningInsights` + `adjustRecencyScores` for each in a single pass, and returns per-user stats.
- **`tests/unit/orc-learning.test.ts`** — 16 unit tests covering `writeOutcomeToDecisionLog` (update shape, null description, never-throws), `computeLearningInsights` (empty data, DB error, mode rates, tier rates, lookback param, throws), and `adjustRecencyScores` (no decisions, no context, tier-1 boost, tier-1 penalty, tier-2 constraint boost, score clamping, throws).

### Changed
- **`app/api/goals/[id]/route.ts`** — PATCH handler now calls `writeOutcomeToDecisionLog` fire-and-forget on both `completed` (outcome `'successful'`) and `failed` (outcome `'failed'`) status transitions.

---

## [Unreleased] — ORC Orchestration Phase 3 Week 5 · 2026-05-17
> Branch: `claude/orc-phase3-recurring-missions`

### Added
- **`supabase/migrations/20260517000010_recurring_missions.sql`** — `recurring_missions` table: id, user_id, title, founder_input, cadence (daily/weekly/monthly), cadence_day, next_run_at, last_run_at, last_goal_id, source_goal_id, is_active, auto_dispatch, risk_tier_limit (1–3), run_count, created_at, updated_at. RLS with service_role bypass; partial index on `(next_run_at, is_active) WHERE is_active = true`.
- **`lib/recurring-missions.ts`** — Core scheduling library:
  - `calculateNextRun(cadence, fromDate, cadenceDay?)` — daily: +1 day at 9am; weekly: +7 days at 9am; monthly: +1 month at 9am (end-of-month clamped). Seconds/ms always zero.
  - `checkAutoDispatchEligibility(mission, orcDecision)` — gate: `auto_dispatch=true` + mode in `['quick_plan','direct_action']` + zero risk notes + `risk_tier ≤ risk_tier_limit`.
  - `createRecurringMission(userId, input)` and `listRecurringMissions(userId)` — Supabase helpers.
- **`app/api/cron/recurring-missions/route.ts`** — Cron handler (CRON_SECRET auth, `maxDuration: 300`). Finds due missions (`is_active=true`, `next_run_at ≤ now`). Per mission: creates goal row, runs `runOrchestratorTask`, optionally auto-dispatches all pending tasks via the internal dispatch endpoint, updates `next_run_at`/`last_run_at`/`run_count`.
- **`app/api/recurring-missions/route.ts`** — GET (list) / POST (create) with Zod validation.
- **`app/api/recurring-missions/[id]/route.ts`** — PUT (update, recomputes `next_run_at` if cadence changed) / DELETE (hard delete).
- **`tests/unit/recurring-missions.test.ts`** — 16 unit tests: `calculateNextRun` (daily, weekly, monthly, clamping, cadence_day, precision), `checkAutoDispatchEligibility` (all gate conditions).

### Changed
- **`components/war-room/WarRoom.tsx`** — Added `RecurringMissionModal` (cadence radio, auto_dispatch checkbox, risk_tier_limit radio when auto_dispatch on) and "↻ Set as recurring" button in `SynthesisReportCard` footer (non-direct-response goals only). Shows "✓ Recurring mission set" after success.
- **`lib/llm-client.ts`** — Persists `risk_tier: riskAssessment.tier` inside the `orc_decision` JSONB column on the `goals` row.
- **`types/index.ts`** — Added `risk_tier?: 1 | 2 | 3` to `Goal.orc_decision`; added `RecurringCadence` and `RecurringMission` types.

---

## [Unreleased] — Test Suite Remediation · 2026-05-17
> Branch: `claude/orc-phase3-recurring-missions`

### Fixed
- **43 pre-existing test failures** resolved across 3 test files; suite now 231/231:
  - `lib/utils.ts` — `formatErrorMessage` SYSTEM_LIMIT_EXCEEDED branch now includes `tokensUsed` and `limit` from parsed data.
  - `lib/artifact-transformers/index.ts` — `detectOutputType` accepts `content: unknown` (short-circuits on non-string pre-parsed objects); `skill === 'image'` routes to `transformToMarkdownResearch` (was 'jpg'); narrative detection threshold corrected for multi-string objects.
  - `tests/unit/artifact-transformers.test.ts` — xlsx mock returns `{ SheetNames: [], Sheets: {} }` from `book_new`; added `encode_cell` and `json_to_sheet` to xlsx mock; docx constructors use `vi.fn(function() {})` (not arrow functions) for `new` compatibility; KB file fixture UUIDs made valid.
  - `tests/unit/edge-cases.test.ts` — global `mockSupabaseClient` and inline memo-write builder both add `.is: vi.fn().mockReturnThis()`; `callLLM` calls updated to positional signature `callLLM(model, prompt)`; result assertions check `result.content`; auth guard test sets `COMPOSIO_API_KEY` env var; hallucination guard uses `mockResolvedValue` + `toBeGreaterThanOrEqual(2)`.

---

## [Unreleased] — ORC Orchestration Phase 2 · 2026-05-17
> Branch: `claude/orc-orchestration-phase-1-RtqTf`

### Added
- **`lib/capability-checker.ts`** — Brain 3 (Realism). Loads `capability_inventory`, detects capability gaps relevant to the goal intent via keyword overlap, and resolves `external_services` vendor options for any hard gap.
- **`lib/risk-assessor.ts`** — 3-tier risk engine (pure function, no async):
  - Tier 1: Generates explicit assumption statements from `orc_context` preference/strategy rows.
  - Tier 2: Detects conflicts between constraint rows and goal intent using pattern matching (no-external, bootstrapped, no-cold-outreach, etc.).
  - Tier 3: Escalates and surfaces external service options when capability gaps are hard-blocked.
- **`enrichWithKnowledgeBase(intent, userId)`** in `orc-decision-gate.ts` — Direct Supabase keyword search against `knowledge_base_files`, fast count check skips search on empty KB, fail-open, returns top-3 matches.
- **`formatKbContextForPrompt()`** — Formats KB matches for injection into the Orc prompt.
- **`extraRiskNotes` param on `orcDecisionGate()`** — Pre-computed risk notes from `assessGoalRisk` are injected into the classifier prompt and merged (deduplicated) into the returned `risk_notes`.
- **`orc_decision_log` table** (migration `20260516000009`) — Records every routing decision with: mode choice, confidence, assumptions, risk tier, risk notes, capability gaps, and eventual outcome. RLS-protected, indexed on `(user_id, goal_id)` and `(user_id, outcome, created_at)`.
- **`external_services` table** (migration `20260516000008`) — Vendor registry for capability gap escalation, seeded with: Video Editing (Fiverr/Upwork), Legal Review (Clerky/UpCounsel), Financial Audit (Pilot.com/Kruze), Brand Identity (99designs), Data Engineering (Toptal/Fiverr Pro).
- **Tests**: `capability-checker.test.ts` (13 cases) and `risk-assessor.test.ts` (17 cases) — all 73 tests pass across new and existing suites.

### Changed
- **`runOrchestratorTask`** — Replaced sequential context fetch with parallel `Promise.all` over `buildOrcContext`, `fetchOrcContext`, `detectCapabilityGaps`, and `enrichWithKnowledgeBase`. Capability gap context and KB context are now injected into the Orc prompt. Risk assessment assumptions are surfaced in the mode hint. Every decision is fire-and-forget persisted to `orc_decision_log`.
- **`orcDecisionGate`** — Updated signature (`extraRiskNotes?: string[]`), merges pre-assessed risk notes with classifier-generated notes via deduped union; falls back with `extraRiskNotes` preserved even on classification failure.

---

## [Unreleased] — ORC Orchestration Phase 1 · 2026-05-16
> Branch: `claude/orc-orchestration-phase-1-RtqTf`

Transforms Orc from a goal dispatcher into a Chief of Staff orchestration engine.

### Added
- **`lib/orc-decision-gate.ts`** — Brain 1 (Memory) + Brain 2 (Decision Tree):
  - `fetchOrcContext(userId)` — fetches top-20 `orc_context` rows ranked by `recency_score`.
  - `seedOrcContextFromMemo(userId)` — idempotent one-time auto-seed from `company_memo` into `orc_context`; fire-and-forget safe.
  - `formatOrcContextForPrompt(rows)` — formats context rows into a compact section-grouped text block.
  - `orcDecisionGate(input, context, history)` — fast LLM pre-classifier (llama-3.1-8b-instant via LiteLLM) that returns a `OrcDecision` before the main orchestrator call. Fails open to `full_plan` at 0.5 confidence on any error.
- **7 response modes** wired into `runOrchestratorTask`:
  - `assistant` — simple question, answer directly with suggested next steps.
  - `clarify` — goal clear but 1–2 critical pieces missing; conversational prose question only.
  - `quick_plan` — routine goal, 3–5 tasks max, minimal dependencies.
  - `full_plan` — complex strategic goal, 5–15 tasks with phase organization.
  - `direct_action` — low-risk atomic action; HITL approval for write operations.
  - `command` — explicit system command; acknowledge and execute.
  - `escalate` — exceeds capabilities; surface alternatives without attempting delivery.
- **`getModeInstructions(mode)`** in `llm-client.ts` — injects precise per-mode instructions into the Orc prompt to reinforce the pre-classifier decision.
- **`OrcModeBadge` component** in `WarRoom.tsx` — color-coded pill for each response mode, shows confidence % when below 75%.
- **`OrcReasoningPanel` component** in `WarRoom.tsx` — collapsible ▶ panel below plan title showing the pre-classifier's reasoning, risk flags, and follow-up options.
- **`PlanningIndicator`** updated to accept `mode` prop — spinner color and description text driven by the classified mode; shows `OrcModeBadge`.
- **`SynthesisReportCard`** updated to accept `goal` prop — shows mode badge in header.
- **Tests**: `orc-decision-gate.test.ts` (19 cases) covering all 7 mode classifications, 4 resilience scenarios (HTTP 503, invalid JSON, unknown mode, network error), confidence clamping, context/history injection.
- **DB migrations applied**:
  - `20260516000005_orc_context` — `orc_context` table with RLS, recency_score + updated_at indexes.
  - `20260516000006_capability_inventory` — `capability_inventory` global registry seeded with 22 capabilities across 7 departments (writing, research, design, engineering, operations, finance, legal) plus external service markers.
  - `20260516000007_goals_response_mode` — `response_mode TEXT` and `orc_decision JSONB` columns added to `goals` (additive, backwards-compatible).

### Changed
- **`runOrchestratorTask`** — Injects `orc_context` summary and mode hint (mode, confidence, reasoning, risk flags, mode instructions) into the orchestrator prompt. Persists `response_mode` and `orc_decision` back to the `goals` row after every dispatch.
- **`ORCHESTRATOR_SYSTEM_NOTE`** — Added Rule 11 requiring the LLM to confirm or override the pre-classifier's `response_mode` in its JSON response.
- **`Goal` type** (`types/index.ts`) — Added `response_mode` (7-value union) and `orc_decision` (mode/confidence/reasoning/risk_notes object).
- **`llm-client.test.ts`** — Updated 5 `runOrchestratorTask` tests to prepend the decision gate fetch mock; updated call-count assertions (+1 for gate call); updated `mock.calls` index for the recent-tasks body assertion.

---

## [2026-05-16] — Artifact Sandbox System

### Added
- **Artifact sandbox lifecycle** — Artifacts now have `status` field: `pending_review → approved | discarded`. Workers produce drafts; founders approve or request changes before finalisation.
- **Output classifier** (`artifact-transformers.ts`) — auto-detects content type (document/spreadsheet/data) from LLM output and applies the correct transformer (docx, xlsx, md, json).
- **Sandbox UI** (`ArtifactSandbox` component) — status badges, approve/discard controls with confirmation.
- **Make Changes workflow** — Founders can provide inline feedback on a draft; the original worker re-runs with revision context and produces an updated artifact.
- **Comprehensive test suite** for the sandbox lifecycle.
- **`ORC_ORCHESTRATION_UPGRADE_PLAN.md`** — Full architectural design document for the Chief of Staff upgrade.

### Changed
- All 6 artifact entry points (email, content, research, analysis, code, operations) rewired through the output classifier.
- Spec and `CROST_MASTER.md` updated with sandbox DoD and artifact lineage requirements.

---

## [2026-05-15] — Security Audit Remediation (v11.95)

Resolved all 18 findings from the comprehensive codebase security audit.

### Security
- **#1a** Knowledge search route now requires session auth; internal calls use `x-crost-internal-secret`.
- **#1b** Knowledge read route gated on session auth with same internal bypass.
- **#2** Composio connect route requires session auth; uses `user.id` from session (not request body).
- **#3** Department reset route requires session auth + ownership check.
- **#4** Goals report route uses dual-mode auth (session+ownership OR internal secret).
- **#5a/5b** Settings tools routes require session auth + ownership checks.
- **#6** Secret-presence endpoint gated on session auth; query scoped to authenticated user.
- **#7** CRON routes always require `CRON_SECRET`; return 500 when env var unset.
- **#8** All three goal update sites in dialogue route now include `.eq('created_by', user.id)`.
- **#10** `WORKER_INTERNAL_SECRET` introduced for `x-crost-internal-secret` bearer; falls back to `SERVICE_ROLE_KEY` for backwards compat.
- **#13** Replaced brace-counting `extractJsonObject` with `JSON.parse`-based extraction + Zod validation.
- **#14** Per-user hourly upload rate limit (max 10/hr) added to knowledge upload route.
- **#15** Artifact transformer failures surfaced to `event_log` and memo; `transformFailed` flag exposed.
- **#16** `_metadata` added to `ApiResponse` type; `apiOk`/`apiError` helper functions introduced for new routes.
- **#17** Idempotency keys added to prevent duplicate goal/task submissions.
- **#18** 10 MB body size limit added for API `POST`/`PUT`/`PATCH` routes in middleware.
- **#1 (audit-#1)** Orc direct-response mission report detection aligned.

### Fixed
- Section 4 product/prompt fixes: orchestrator mode detection, Gmail `to` field, KB humanization, social posting fallback.
- Removed `/api` matcher from middleware; removed unused body size check.

---

## [2026-05-07] — Approvals Hardening & Observability (v11.93–v11.95)

### Added
- Composio slug overrides applied at approval execution; correct `action_type` emitted in event log.
- `approval_requested` event emitted for the direct LLM path (previously only emitted for the worker path).

### Fixed
- `created_by` added to `Goal` interface (TypeScript).
- All undefined `toolName` TypeScript errors in `worker/execute` route resolved.
- Full-stack observability improvements, department slug normalisation, multi-tenant RLS hardening.

---

## [2026-05-02/03] — Orchestration Improvements (v11.85–v11.92)

### Added
- **Silent provider fallback** — `callLLM` silently switches through `RESILIENT_FALLBACK_CHAIN` (llama-3.3-70b → gemini-2.0-flash → llama-3.1-8b) on 4xx/5xx errors; each switch is logged to `event_log` without interrupting the founder.
- **Waterfall task dependencies** — `depends_on` task IDs are remapped to real UUIDs after plan parsing; tasks with unresolved dependencies correctly block until their blockers complete. `skipped` status added for tasks whose blockers failed.
- **Artefact lineage UI** — artifact cards link back to the source goal and task.
- **Orc self-introduction** — "I am Orc (short for Orchestrator), your AI Chief of Staff" response wired.
- **Force-plan resilience** — repeated clarification guard detects when Orc re-asks the same question and forces a plan on the second attempt.
- **Marketing image generation fallback** — design department falls back to a descriptive prompt when image generation is unavailable.
- **Branded `ConfirmationModal`** replaces all native `window.confirm` dialogs.
- **Usage limit reset time** displayed in the quota-exceeded error message; event log deep-linking added.

### Fixed
- Strategic memory bug where `orc_context` was not being read after the first session resolved.
- AI pipeline error handling: LLM errors now surface with clean user-facing messages rather than raw JSON.
- Production build failure: `provider_fallback` added to `EventType` enum.
- Cookie force-purge for legacy auth sessions.
- 431 (Request Header Too Large) resolved definitively by header size reduction.
- Empty/blocked LLM responses now surfaced as explicit errors instead of silent task stalls.

---

## [2026-05-01] — Initial Stable Foundation

### Added
- Claude Code launch configuration (`.claude/launch.json`).
- Core Orc orchestrator with goal dispatch, department routing, and HITL approval flow.
- LiteLLM proxy integration as the unified LLM gateway for all model calls.
- `company_memo` and `company_memos` dual-write architecture for structured + unstructured company context.
- `capability_inventory` concept (pre-populated in later sessions).
- Supabase RLS across all user-scoped tables.
- Knowledge Base file processing pipeline with vector + keyword search.
- Artifact upload to Supabase Storage with MIME-type detection.
- Department skill system (`loadSkillsForTask`) for prompt specialisation.
- Suggested actions generation after goal completion.
- `logUsage` / `checkTokenBudget` per-user daily token quota with first-goal exemption.
- War Room UI: goal status tracking, plan card, task waterfall view, synthesis report.
