> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 11.29  
**Last Updated:** April 25, 2026  
**Deployment Status:** ✅ COMPLETE — Badge count sync, cross-user realtime fix, error handling.

---

## Session v11.29 — Badge Count Sync & Realtime Fix
**Date**: 2026-04-25 **Status**: ✅  
**Impact**: Fixed artifact badge count mismatch, hardened pending-approval queries against dual user columns, and eliminated cross-user count contamination in the realtime subscription.

### What Was Built
1. **Artifact badge count sync** (`layout.tsx`): Replaced `count: 'exact'` (which returned raw unfiltered count) with a `select('id, title, body')` query that applies the same client-side filter as `artifacts/page.tsx` — excluding artifacts whose `title` or `body` starts with `[TOOL EXECUTION FAILED`. Badge now matches the grid count.
2. **Pending count dual-column query** (`layout.tsx`): Server-side pending approval query now checks both `created_by` and `user_id` via `.or()`, matching the browser-side refresh in `LayoutStoreHydrator`. Eliminates silent under-counting when legacy rows only have `user_id` populated.
3. **Error handling** (`layout.tsx`): Added silent `console.error` logging for `pendingResult.error` and `artifactListResult.error` — layout no longer swallows DB failures.
4. **Realtime subscription fix** (`LayoutStoreHydrator`): Replaced optimistic increment/decrement logic with a full `refreshCount()` re-fetch on every `approval_queue` change. The old code blindly adjusted the counter for ALL database events, leaking counts across users. The new approach is slightly more chatty but always correct.

### Files Changed
- `frontend/app/dashboard/layout.tsx`
- `frontend/components/providers/LayoutStoreHydrator.tsx`

---

## Session v11.28 — Artefacts Gallery v1
**Date**: 2026-04-25 **Status**: ✅  
**Impact**: Transformed the Artefacts page from a bare row-list into a visual card grid with rich previews, structured metadata, and trust signals. All changes are backward-compatible and type-safe.

### What Was Built
1. **Schema**: Added `file_size` (INTEGER) and `task_id` (UUID) columns to `artifacts` table with indexes.
2. **Types**: Updated `Artifact` interface — `file_size`, `task_id`, `created_by` now required fields.
3. **API**: `POST /api/artifacts` accepts `file_size` and `task_id`; strengthened `file_url` validation to use `new URL()` parse instead of string `includes`. `DELETE /api/artifacts/[id]` fixed event_type from `artifact_created` → `artifact_deleted`.
4. **Worker**: `uploadArtifact()` now returns `fileSize` computed from `Buffer.byteLength()`; artifact insert in `runWorkerTask()` populates `file_size` and `task_id`.
5. **Page**: `dashboard/artifacts/page.tsx` now fetches goals + departments in parallel, builds lookup maps, and renders a responsive CSS grid (`repeat(auto-fill, minmax(280px, 1fr))`). Canonical empty-state copy: "Your generated files will appear here".
6. **Card Grid**: New `ArtifactCard.tsx` with:
   - Colored file-type icon placeholder (no new infra)
   - Thumbnail for images
   - Title, dynamic department badge with color from DB, goal tag
   - `timeAgo()` timestamp, format badge, file size
   - Kebab menu (⋯) with Download / Delete actions
   - Hover lift effect
7. **Detail Drawer**: Slide-over panel with **Preview** | **Details** tabs:
   - Preview tab: iframe for PDF, Office Online embed for PPTX/DOCX/XLSX, content preview for others (all existing logic preserved)
   - Details tab: structured metadata table (Type, Format, Created by, Created at, Size, Goal, Task) + Skills Used tags
   - CitationsSection and SuggestedActionChips preserved unchanged
   - Download button shows filename: `Download {filename}`
8. **Sidebar**: `SidebarNav` now accepts `artifactCount` prop; `Artifacts` nav item shows badge count. `dashboard/layout.tsx` fetches count via `select('id', { count: 'exact', head: true })`.

### Files Changed
- `supabase/migrations/20260425130000_artifacts_file_size_task_id.sql` (new)
- `frontend/types/index.ts`
- `frontend/app/api/artifacts/route.ts`
- `frontend/app/api/artifacts/[id]/route.ts`
- `frontend/lib/llm-client.ts`
- `frontend/app/dashboard/artifacts/page.tsx`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/components/dashboard/SidebarNav.tsx`
- `frontend/app/dashboard/layout.tsx`

### Deferred to Post-MVP
- Star / Pin system
- Lineage tab (needs multi-table joins)
- Memos tab (needs `sources.memo_ids` query)
- "Use in Task" / "Send to Dept" actions
- Storage used indicator
- Page navigation (1/24) for multi-page docs
- Upload button (artefacts are dept outputs per spec)
- Share Link (needs public URL auth)
- Server-side thumbnail generation for PPTX/DOCX

---

## Session v11.27 — Approval Queue REST Polling Elimination
**Date**: 2026-04-25 **Status**: ✅  
**Impact**: Eliminated ~100% of Realtime-triggered REST calls to `approval_queue`. During active missions, every DB change previously fired a full Supabase REST roundtrip; now count is derived directly from the Realtime payload. Fallback interval extended from 15s to 60s. Removed duplicate subscription in `RealtimeProvider`.

---

## Session v11.27 — Approval Queue REST Polling Elimination
**Date**: 2026-04-25 **Status**: ✅  
**Impact**: Eliminated ~100% of Realtime-triggered REST calls to `approval_queue`. During active missions, every DB change previously fired a full Supabase REST roundtrip; now count is derived directly from the Realtime payload. Fallback interval extended from 15s to 60s. Removed duplicate subscription in `RealtimeProvider`.
### What Was Built
1. `LayoutStoreHydrator`: Realtime callback now reads INSERT/UPDATE/DELETE payload to adjust count in-place — zero REST calls on DB changes
2. `LayoutStoreHydrator`: uses `useCrostStore.getState()` to avoid stale closure on count
3. `LayoutStoreHydrator`: fallback `setInterval` extended from 15s → 60s
4. `RealtimeProvider`: removed redundant `approval_queue` subscription that also fired REST queries on every change
### Files Changed
- `frontend/components/providers/LayoutStoreHydrator.tsx`
- `frontend/components/providers/RealtimeProvider.tsx`

---

## Session v11.26 — Mission Report: Truncation + Tone + Markdown Fix
**Date**: 2026-04-25 **Status**: ✅  
**Impact**: Mission Report bodies now store full LLM output (no 1000-char cut-off), use real `##` markdown headers, and open with outcome-first direct language instead of corporate preamble.
### What Was Built
1. Removed `formatMemoBody()` truncation from `runOrcReport` — `content` now stored directly; no more `[TRUNCATED FOR EGRESS EFFICIENCY]`
2. Rewrote system prompt: "Orc, sharp Chief of Staff, no ceremonial language, clean markdown headers"
3. Rewrote user prompt: instructs `##` headers (not `**bold**` pseudo-headers), outcome-first, no preamble
### Files Changed
- `frontend/lib/llm-client.ts`

---

## Session v11.25 — Suggested Actions 401 Fix & Edge-Case Hardening
**Date:** April 25, 2026  **Status:** ✅  
**Impact:** Suggested action chips ("Send to email", "Save to KB", "Add to Memo") now execute end-to-end without 401 errors; edge-case failures surface correctly instead of silently marking actions completed.
### Root Cause
Both `/api/suggested-actions/[id]/execute` and `/api/suggested-actions/execute` used `createServerSupabaseClient()` (service-role key, no cookie context) for `auth.getUser()`. The service-role client never has a session, so `getUser()` always returned `null` → 401 on every chip tap from the browser.
### What Was Fixed
1. `[id]/execute/route.ts`: Changed to `createSupabaseServerComponentClient()` for auth; kept service-role client for DB writes (ownership verified with `.eq('created_by', userId)`)
2. `execute/route.ts` (bulk): Same auth fix
3. `[id]/execute/route.ts`: Fixed `goalId = merged.goal_id || actionId` → `goalId = (merged.goal_id as string) || null` (using actionId as a fake goal_id caused phantom goal FK rows)
4. `[id]/execute/route.ts`: Added explicit `missing_connection` (409) and `permission_denied` (403) result branches — previously both fell through to the success path and incorrectly marked actions `completed`
5. `lib/execute-suggested-action.ts`: Fixed stale status guard (`'generated'` only → accepts `'suggested' | 'generated' | 'tapped'`); fixed `goalId ?? '' ` → `goalId ?? null`; added `missing_connection` / `permission_denied` handling
### Files Changed
- `frontend/app/api/suggested-actions/[id]/execute/route.ts`
- `frontend/app/api/suggested-actions/execute/route.ts`
- `frontend/lib/execute-suggested-action.ts`

---

## Session v11.24 — /tool Slash Command End-to-End Fix
**Date:** April 25, 2026  **Status:** ✅  
**Impact:** `/knowledge_base_search` and `/gmail.send_email` (and all /tool commands) now execute correctly end-to-end; suggested actions appear in the War Room CommandThread after task completion.
### What Was Built
1. `execute-tool-call.ts`: Expanded internal tool bypass to recognise `knowledge_base_search` by service name (not just `service='internal'`); added `params.text` fallback so raw `/knowledge_base_search <text>` parses correctly
2. `execute-tool-call.ts`: Changed `goalId: string` → `string | null` throughout; fixed storage path for null goalId (`direct/<userId>/`); `handleToolResultArchiving` now returns `{ artifactId }` and calls `generateAndInsertSuggestedActions` after artifact creation
3. `invoke/route.ts`: Fixed `goal_id ?? ''` → `goal_id || null` (empty string caused UUID type error in `tool_executions`); returns `artifact_id` in response
4. `WarRoom.tsx`: Added `goal_id` and `artifact_id` to `InlineMessage`; stores them from @dept / /tool responses; added `DeferredMissionReportChips` component (polls every 3 s for mission report by goal_id, then renders chips); CommandThread renders chips once response loads
### Files Changed
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/app/api/tools/invoke/route.ts`
- `frontend/components/war-room/WarRoom.tsx`

---

## Session v11.23 — Approval Chip Polling Fix
**Date:** April 25, 2026  **Status:** ✅  
**Impact:** Chips stuck in "Pending approval" now resolve to "Action Executed" within 5 s of the approval being executed, without a page reload; completed actions flow into Mission Report via the existing approval→chain-reaction path.
### What Was Built
1. `SuggestedActionChips`: added 3 s polling loop (active only while `chipState === 'approval'`), removed premature `onDone` timeout, restored `approval` state on mount when DB row is `approved`, added `'approved'` to status fetch filter
2. `approvals/[id]/route.ts`: after execution success/failure, update the linked `suggested_actions` row via `approval.tool_execution_id → suggested_actions.approval_id`
3. `execute-tool-call.ts`: fixed `approval_queue` insertion — `action_type` is now `fullyQualifiedTool` (e.g. `GMAIL_SEND_EMAIL`) so the approval PATCH handler can resolve and re-execute the Composio action; payload flattened to `{ ...params, __service }` so Composio receives correct parameters
### Files Changed
- `frontend/components/suggested-actions/SuggestedActionChips.tsx`
- `frontend/app/api/approvals/[id]/route.ts`
- `frontend/lib/tools/execute-tool-call.ts`

---

## Session v11.22 — Mission Report UI & Formatting Fix
**Date**: April 25, 2026  **Status**: ✅  
**Impact**: Strategic Mission Reports are now human-readable with proper hierarchy, bolding, and lists.
### What Was Built
1. Created `MarkdownLite` component in `WarRoom.tsx` to handle headers, lists, and bold text without external dependencies.
2. Enhanced `SynthesisReportCard` with improved spacing, typography, and a "Strategic Output" brand treatment.
3. Added global CSS for `.markdown-lite` to ensure consistent, elegant rendering of AI-generated synthesis.
### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/app/globals.css`
- `CROST_MASTER.md`


**Date**: April 24, 2026
**Status**: ✅ COMPLETE
**Impact**: All remaining MVP DoD items resolved. App is now feature-complete for v1 launch.

### What Was Built
1. **H1 — In-browser artefact preview** (`ArtifactCard.tsx`): PDF renders via native browser `<iframe>`. PPTX/DOCX/XLSX render via Microsoft Office Online embed (`view.officeapps.live.com`). Images now also fall back to `file_url` if `preview_url` is absent. `data`/`code` types still show "Native File Available" badge.
2. **G1 — `user_consents` insert** (`signup/page.tsx`): On successful OTP verification, inserts a `user_consents` row with `user_id`, `source` (from `?source=` param, default `direct`), `consent_type: 'terms_and_privacy'`, and `consented_at`.
3. **G3 — CTA copy** (`signup/page.tsx`): "Initialize Crost →" → "Start Free →" per spec §2 Beat 2.

### Files Changed
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/app/signup/page.tsx`

### MVP DoD Status
- H1 ✅ H2 ✅ H3 ✅ G1 ✅ G3 ✅ — all items resolved. M1 (memo table migration) and M2 (app store) are post-MVP.

---

## Session v11.20 — SuggestedActionChips Full State Machine + Merge Best-of-Both

**Date**: April 24, 2026
**Status**: ✅ COMPLETE
**Impact**: Completes §6.1 end-to-end — chip taps now have full UX (inline input, spinner, done/error/approval states), enriched action payloads with file metadata, save_to_kb action, and a RESTful per-ID execute route. Also fixes risk_tolerance query bug and token-optimises CLAUDE.md.

### What Was Built
1. **`SuggestedActionChips.tsx` full state machine** — `idle → needs_input → loading → done/approval/error` per chip. Inline email input panel with Enter-to-submit/Esc-to-cancel. Risk-level colour coding (amber medium, green low). Completed chips stay visible as audit trail.
2. **`/api/suggested-actions/[id]/execute/route.ts`** — RESTful per-ID execute handler. Routes: `send_to_email` → `executeToolCall(executive, gmail.send_email)` → HITL; `save_to_kb` → `knowledge_base_files` insert; `add_to_memo` → `company_memos` insert; `make_changes` → redirect hint. Threads outcome back to SuggestedAction row (completed/failed/approved).
3. **`lib/suggested-actions.ts` enriched payloads** — Added `artifact_title` param; `make_changes` and `add_to_memo` now carry full payload; `save_to_kb` action added; `send_to_email` now includes `file_url`, `file_name`, `subject`, `required_inputs: ['destination_email']`.
4. **`execute-tool-call.ts` risk query fix** — `eq('created_by', userId)` → `eq('user_id', userId)` for `system_config` risk_tolerance lookup.
5. **`CLAUDE.md` token-optimised** — Tiered reading model (Spec_Review_v4 first, then targeted §sections). Under 200 lines. Eliminates "read full CROST_SPEC.md" instruction that cost 25k tokens per session.
6. **`Spec_Review_v4.md` added** — 150-line authoritative current-state tracker with MVP DoD checklist and open gaps (H1 in-browser preview, H2 middleware OTP, H3 duplicate email).
7. **`llm-client.ts`** — Pass `artifact_title` to `generateAndInsertSuggestedActions` from artifact creation path.

### Files Changed
- `frontend/components/suggested-actions/SuggestedActionChips.tsx`
- `frontend/app/api/suggested-actions/[id]/execute/route.ts` (new)
- `frontend/lib/suggested-actions.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/lib/llm-client.ts`
- `CLAUDE.md`
- `Spec_Review_v4.md` (new)

---

## Session v11.19 — XLSX Skill Routing & Output-Type Detection Fix

**Date**: April 24, 2026
**Status**: ✅ COMPLETE
**Impact**: Fixes four compounded root causes that caused spreadsheet tasks (e.g. "Create sample FY28 projection Excel sheet template @finance") to be misrouted to `docx` instead of `xlsx`.

### Changes
1. **Skill injection wired in direct `@dept` endpoint** — `POST /api/departments/[slug]/task` now calls `loadSkillsForTask(body.task, dept.slug, {})` before `buildFinalPrompt()` and passes the skill content as the 7th argument. Previously the direct-dispatch path never loaded skills, so the LLM never received the xlsx SKILL.md contract.
2. **Keyword map expanded for xlsx triggers** — `ACTION_SKILL_MAP` in `lib/skills/index.ts` already contained expanded keywords (`excel`, `spreadsheet`, `workbook`, `budget`, `forecast`, `projection`, `tracker`, `p&l`, `balance_sheet`, `income_statement`, `cash_flow`, `kpi_tracker`, `financial_model`, `excel sheet`, `excel template`, `sheet template`, `spreadsheet template`). This was in place from a prior edit; this session verified it and ensured propagation.
3. **`orderSlugs` priority reordered** — changed from `['pptx', 'docx', 'xlsx', 'pdf', 'pitch_deck']` to `['pptx', 'xlsx', 'docx', 'pdf', 'pitch_deck']`. When a multi-intent prompt matches both docx and xlsx keywords, xlsx now wins (its SKILL.md is presented first to the LLM).
4. **`detectOutputType` now receives founder prompt hint** — extended `createArtifactFromContent` in `route.ts` and `uploadArtifact` in `llm-client.ts` to accept an optional `taskHint` string, which is forwarded to `detectOutputType(content, isJson, taskHint)`. The hint regex (`excel|xlsx|spreadsheet|workbook|budget|forecast|projection|...`) overrides weak response-shape heuristics, so even if the LLM drifts to narrative the task text still routes to the correct transformer.
5. **Worker task propagation** — `runWorkerTask` now passes `task.action` as the `taskHint` argument to `uploadArtifact`, ensuring goal-pipeline artifacts also benefit from founder-prompt-aware detection.

### Edge cases covered
- Multi-intent prompts like "write the FY28 report as an Excel sheet" — both docx and xlsx skills load; xlsx wins via priority ordering and taskHint override.
- LLM response drifts to narrative inside JSON — `taskHint` regex still routes to xlsx.
- Direct `@dept` dispatch and goal-pipeline (`runWorkerTask`) — both paths now load skills and pass task hints.
- Missing SKILL.md file — `loadSkillsForTask` is non-fatal; empty skill content gracefully falls through.
- Type-check clean — `tsc --noEmit` passes with zero errors.

### Files Changed
- `frontend/lib/skills/index.ts`
- `frontend/app/api/departments/[slug]/task/route.ts`
- `frontend/lib/llm-client.ts`
- `CROST_MASTER.md`

---

## Session v11.18 — War Room Execution, Orc Mission Report for `@dept`, XLSX Double-Encoded JSON Healer

**Date**: April 24, 2026
**Status**: ✅ COMPLETE
**Impact**: Three correctness fixes in the goal/approval/artifact pipeline.

### Changes
1. **War Room stuck on "ACTION EXECUTING"** — `WarRoom.tsx` treats `execution_status === null` as a terminal no-op (not "still running") and only `'failed'` marks an error. Added a 90 s safety-net poll of `GET /api/approvals/:id` so the UI reconciles with the server even if the PATCH response was truncated by a cold-start / edge-function timeout.
2. **Orc Mission Report missing for `@dept` direct dispatches** — `/api/departments/[slug]/task` now creates a synthetic single-department goal on entry (status `executing`, valid per the CHECK constraint), propagates `goal_id` into every memo / artifact / approval / event_log insert, and fires `runOrcReport` + closes the goal on completion. The approvals handler also inline-fires `runOrcReport` when the goal has zero `goal_tasks` rows (i.e. the synthetic case), so approved single-dept tasks still get a Mission Report once the tool executes.
3. **XLSX (and DOCX) generic-fallback regression from double-encoded LLM JSON** — root cause for the malformed spreadsheet sample: the LLM sometimes emits `sheets` (and `sources.*`) as **stringified JSON** inside the outer JSON. Detection passed `skill === "xlsx"` and routed to `transformToExcel`, but `Array.isArray(data.sheets)` was false so the SKILL.md branch was skipped and output fell through to the generic key/value flatten. Fix: added a `healSkillPayload` normalizer in `excel-transformer.ts` / `document-transformer.ts` that recursively re-parses stringified array/object fields (`sheets`, `rows`, `columns`, `sources.memo_ids`, `sources.kb_file_ids`, `sources.tool_calls`, and similar) before the skill-schema branch runs.

### Edge cases covered
- Synthetic goal insert failing (goalId null) — all downstream inserts still succeed (columns nullable).
- Department task throwing mid-LLM — goal marked `failed`, no orphaned `executing` state.
- Approval with no matching executor (`execution_status === null`) — UI now shows APPROVED done, not stuck.
- Server timed out after kicking off Composio — client polling closes the loop.
- `runOrcReport` double-fire — idempotency guard already exists in `llm-client.ts`.
- Real multi-task goals — chain-reaction path untouched; inline Orc only fires when `goal_tasks` count is 0.
- Triple-stringified JSON (rare) — heal function loops until it gets a non-string value or hits a safety depth cap.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/app/api/departments/[slug]/task/route.ts`
- `frontend/app/api/approvals/[id]/route.ts`
- `frontend/lib/artifact-transformers/excel-transformer.ts`
- `frontend/lib/artifact-transformers/document-transformer.ts`
- `CROST_MASTER.md`

---

## Session v11.17 — Spec Review v3 + 8 Critical Fixes

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — Type-check clean. All 8 fixes deployed. `Spec_Review_v3.md` produced.  
**Impact**: Closes the HITL trust contract, hardens auth, wires suggested actions end-to-end, enriches the dashboard, and produces a comprehensive audit document (`Spec_Review_v3.md`) cataloguing all remaining gaps.

### Context
A full code-vs-spec audit of `CROST_SPEC.md` v2.2 against HEAD (`767d30ce`) was performed. The audit identified 5 critical gaps, 6 high-priority gaps, 8 medium-priority gaps, and 6 edge cases. During the audit, 8 critical/high-priority items were fixed immediately; the rest are documented in `Spec_Review_v3.md` with actionable recommendations.

### Fixes Applied

1. **Risk Mode Wiring** (`frontend/lib/tools/execute-tool-call.ts`)
   - **Before**: `LOW_RISK_READ_TOOLS` was a hardcoded whitelist; `system_config.risk_tolerance` was never read.
   - **After**: Queries `system_config` for `risk_tolerance` per user. Implements three-mode threshold table:
     - `careful` → all actions require approval
     - `balanced` (default) → low-risk read-only auto-runs; medium+ requires approval
     - `aggressive` → low + medium auto-run; high + critical always require approval
   - **Spec**: §11 / DoD #10

2. **Middleware OTP Enforcement** (`frontend/middleware.ts`)
   - **Before**: Email/password users could enter onboarding and dashboard without verifying their email.
   - **After**: For `email` provider users with `!email_confirmed_at`, redirects to `/login?unverified=true` unless already on an auth page.
   - **Spec**: §11 / DoD #2

3. **Signup Duplicate Email Redirect** (`frontend/app/signup/page.tsx`)
   - **Before**: Returning users who tried to sign up again saw a generic error toast.
   - **After**: Detects `error.code === 'user_already_exists'` or "already registered" message, shows info toast, redirects to `/login?email=...`.
   - **Spec**: §15.6

4. **Artifact extMap Missing `presentation` + `pdf`** (`frontend/components/artifacts/ArtifactCard.tsx`)
   - **Before**: `extMap` only had `spreadsheet → xlsx` and `document → docx`, so PPTX and PDF artifacts showed generic icons.
   - **After**: Added `presentation → pptx` and `pdf → pdf` mappings with correct MIME types.
   - **Spec**: §9 / DoD #6

5. **Processing Copy Constants** (`frontend/lib/processing-copy.ts` — NEW)
   - **Before**: No canonical loading messages existed; War Room showed generic "ORCHESTRATOR PLANNING…" text.
   - **After**: New constants file with 18 office-themed + 6 warm-playful messages per Spec §2 Beat 8. Includes `getRandomProcessingMessage()` and `getRandomWarmMessage()` helpers.
   - **Note**: Constants are ready but **not yet wired** into `WarRoom.tsx` (remaining gap).
   - **Spec**: §2 Beat 8

6. **KB Search Write-Back to Artifact Sources** (`frontend/app/api/knowledge/search/route.ts`)
   - **Before**: `knowledge_base_search` returned matches but never wrote matched `file_ids` to the calling artifact's `sources.kb_file_ids`.
   - **After**: New `writeKbSourcesToArtifact()` helper accepts an optional `artifact_id` parameter, fetches existing sources to merge (preserving `memo_ids` and `tool_calls`), and writes merged `kb_file_ids` back. Called on all three search return paths: semantic search, keyword fallback, and direct file search.
   - **Spec**: §10 / DoD #14

7. **Suggested Action Gateway** (`frontend/lib/execute-suggested-action.ts` — NEW, `frontend/app/api/suggested-actions/execute/route.ts` — NEW, `frontend/components/suggested-actions/SuggestedActionChips.tsx`)
   - **Before**: Chips rendered but tapping fired `alert('Action execution not hooked up yet!')`.
   - **After**: Full execution gateway built:
     - Loads `SuggestedAction` row, validates `status === 'generated'`
     - Maps all 10 catalog slugs → `(service, action, params)`
     - Routes direct-action slugs through `departmentId: 'executive'`
     - Calls `executeToolCall(...)` with `silent: true`
     - Threads outcomes back into DB (`completed` / `failed` / `dispatched`)
     - Emits `suggested_action_*` event_log entries
   - **Catalog**: `send_to_email`, `add_to_memo`, `make_changes`, `send_to_contact`, `save_to_kb`, `schedule_recurring`, `generate_companion`, `share_with_teammate`, `draft_followup`, `start_new_mission`
   - **Spec**: §6.1, §15.7 / DoD #11

8. **Dashboard "What Next?" Widget** (`frontend/components/dashboard/WhatNextWidget.tsx` — NEW, `frontend/app/dashboard/page.tsx`)
   - **Before**: No dashboard surface for unresolved suggested actions.
   - **After**: Server-fetches top 3 `generated` `suggested_actions` rows per user. Renders a card with emoji icons per action slug, label, reasoning excerpt, risk-level colour badge, and deep-link to the source artifact. Hidden when no suggestions exist.
   - **Spec**: §6.1 Surface #4

### Audit Deliverable

**`Spec_Review_v3.md`** — Comprehensive gap analysis covering:
- Critical gaps: KB search write-back (FIXED), in-browser preview (remaining)
- High-priority gaps: Processing copy wiring, `company_memo` migration, deprecated slug rejection, icon coverage
- Medium-priority gaps: Suggested action expiry, `callEmbeddings` timeout, model routing divergence
- Edge cases: JIT sync race, `start_new_mission` special case, status filter mismatch, risk mode case sensitivity
- File-by-file audit table (14 files)
- DoD checklist (13 items) with ✅ / 🟡 / ❌ status
- Priority-ordered recommendations (15 items)

### Files Changed
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/middleware.ts`
- `frontend/app/signup/page.tsx`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/lib/processing-copy.ts` (NEW)
- `frontend/app/api/knowledge/search/route.ts`
- `frontend/lib/execute-suggested-action.ts` (NEW)
- `frontend/app/api/suggested-actions/execute/route.ts` (NEW)
- `frontend/components/suggested-actions/SuggestedActionChips.tsx`
- `frontend/components/dashboard/WhatNextWidget.tsx` (NEW)
- `frontend/app/dashboard/page.tsx`
- `Spec_Review_v3.md` (NEW)
- `CROST_MASTER.md` (this entry)

---

## Session v11.16 — Artifact Sources / Citations Schema

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — Type-check clean.  
**Impact**: Implements Spec §9 citations requirement (DoD #6, #8, #13, #14). Every artefact now carries a structured `sources` field (`memo_ids`, `kb_file_ids`, `tool_calls`). The DB column is indexed for reverse-lookup. The Artifact drawer in the UI surfaces a "SOURCES" footer with colour-coded badges per source type. All four artifact-creation code paths now include `sources`.

### What Was Built

1. **`ArtifactSources` type** (`types/index.ts`): New interface with `memo_ids: string[]`, `kb_file_ids: string[]`, `tool_calls: Record<string, unknown>[]`. Added as a required field on `Artifact`.

2. **`CreateArtifactSchema`** (`app/api/artifacts/route.ts`): Added `ArtifactSourcesSchema` Zod schema and `sources` field (defaults to empty arrays). API now validates and persists citations on every create call.

3. **Supabase migration** (`supabase/migrations/20260424_add_sources_to_artifacts.sql`): Adds `sources JSONB NOT NULL DEFAULT '{"memo_ids":[],"kb_file_ids":[],"tool_calls":[]}'` column. Adds GIN indexes on `sources->'memo_ids'` and `sources->'kb_file_ids'` for efficient reverse-lookup. Includes a backfill UPDATE for any pre-existing rows.

4. **`ArtifactCard.tsx`** (`components/artifacts/ArtifactCard.tsx`): New `CitationsSection` component rendered in the detail drawer. Shows colour-coded badges (MEMOS / KB FILES / TOOLS) with count summaries. Tool calls expose a collapsible JSON detail view. Empty state shows a clear "No citations recorded" message.

5. **Artifact creation sites** (4 files): Added `sources` with correct defaults/values:
   - `lib/llm-client.ts` — worker task output (empty arrays; structure ready for future KB + memo population)
   - `lib/tools/execute-tool-call.ts` — tool execution artifacts populate `tool_calls` with `{ service, action, executed_at }`
   - `app/api/tools/execute/route.ts` — mock save_document populates `tool_calls`
   - `app/api/worker/execute/route.backup.ts` — backup route populated with tool name

### Files Changed
- `frontend/types/index.ts`
- `frontend/app/api/artifacts/route.ts`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/lib/llm-client.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `frontend/app/api/tools/execute/route.ts`
- `frontend/app/api/worker/execute/route.backup.ts`
- `supabase/migrations/20260424_add_sources_to_artifacts.sql` (new)
- `CROST_MASTER.md` (this entry)

---

## Session v11.15 - Mission Report Completeness Fix

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — Type-check clean. Three bugs eliminated.  
**Impact**: Mission Reports now generate exactly once (no duplicates), emit the canonical `goal_mission_report_written` event so the live events panel reflects completion, and the body truncation guard is clean of dead legacy references.

### Bugs Fixed

1. **Idempotency check used wrong title prefix** (`llm-client.ts`): The guard queried `title.ilike.[ORC REPORT]%` but the title prefix was renamed to `[Mission Report]`. Every call to `runOrcReport` always saw no existing report and re-generated, creating duplicate Mission Report memos. Fix: query now matches both `[Mission Report]%` (current) and `[ORC REPORT]%` (legacy rows) via `.or()`.

2. **`goal_mission_report_written` event never fired** (`llm-client.ts`): The event type exists in `types/index.ts` and the DB CHECK constraint, and `scripts/worker.ts` correctly emits it, but `runOrcReport` in `llm-client.ts` never called `logEvent`. The live events panel therefore never showed Mission Report completion. Fix: added `logEvent({ event_type: 'goal_mission_report_written', ... })` after the report memo is inserted and suggested actions are generated.

3. **Dead `[ORC REPORT]` check in `formatMemoBody`** (`utils.ts`): The body truncation guard checked `body.includes('[ORC REPORT]')` — a prefix that only appeared in memo *titles*, never in memo *bodies*. This branch was unreachable. Fix: removed the dead check, kept only `[Mission Report]`.

### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/lib/utils.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.14 - Artifact Transformer Skill Schema Fix

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — Type-check clean. All 6 output checks pass.  
**Impact**: Resolved broken xlsx and docx output for any goal that used the SKILL.md output contract. Previously, skill-schema JSON was dumped as raw key/value rows (the `sheets` array became a JSON string in a single cell). Now all skill-schema output correctly produces multi-sheet, formatted, formula-ready files.

### Root Cause

The LLM follows `SKILL.md` and emits `{ "skill": "xlsx", "sheets": [...] }` or `{ "skill": "docx", "sections": [...] }`. Neither `detectOutputType` nor the transformers recognised the `skill` field — the entire JSON fell through to the generic `flattenToRows` fallback, producing a two-column key/value sheet where `sheets` was a raw JSON blob in a single cell.

### Changes

1. **`detectOutputType` (index.ts)** — Added highest-priority check (before all heuristics) for `parsed.skill === "xlsx"` → `transformToExcel` and `parsed.skill === "docx"` → `transformToDocument`.

2. **`excel-transformer.ts`** — Added `transformSkillSchema()` at the top of `transformToExcel`. Handles:
   - String columns (`"Column Name"`) and object columns (`{key, header, type, width, format}`) — both normalised uniformly
   - Array rows and object rows — mapped correctly by index or key
   - Formula cells (`=...`) stored as actual Excel formula cells (not string literals)
   - Totals row with `=SUM()` formulas auto-generated for numeric/currency/percent columns
   - Column widths from the `width` field
   - Number formats (`z` property) for currency, percent, number, date columns
   - Freeze panes (`!sheetViews`) for all sheets with `freeze_header_row: true`
   - Default number formats applied by `type` when no explicit `format` is given

3. **`document-transformer.ts`** — Added `skill: "docx"` handler at the top of `transformToDocument`. Handles:
   - Title, subtitle, author, date metadata
   - Recursive `sections` array with `heading`, `content`, `subsections`
   - Heading levels 1/2/3 mapped to HEADING_1/2/3
   - `footnotes` array rendered as a References section at the end

### Files Changed
- `frontend/lib/artifact-transformers/index.ts`
- `frontend/lib/artifact-transformers/excel-transformer.ts`
- `frontend/lib/artifact-transformers/document-transformer.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.13 - Terminology Canonicalization & Legacy Data Transformation

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — All UI surfaces and background emitters updated to canonical "Mission Report" naming.  
**Impact**: Resolved critical Spec Gap regarding terminology consistency. The system now enforces "Mission Report" globally and gracefully transforms legacy "Post-mortem" data from existing database records during display.

### Changes

1. **Strategic Synthesis Removal**: Replaced the hardcoded "Strategic Synthesis" label in `SynthesisReportCard` (`WarRoom.tsx`) with the canonical "Mission Report" label.
2. **Orc Report → Mission Report**: Standardized the header in the War Room synthesis card and the title prefix in the LLM generation logic (`llm-client.ts`) to use "Mission Report".
3. **Legacy Data Transformation Layer**:
    - **Event Log**: Added a display-time transformation in `EventLogClient.tsx` that maps `goal_post_mortem_written` events to "Mission Report Written" and replaces "Post-mortem" strings in descriptions.
    - **War Room Error Summaries**: Applied terminology transformation to the `goalErrorEvents` display to ensure legacy error logs are correctly labeled.
    - **Synthesis Reports**: Injected a transformation into the report body rendering in the War Room to ensure historical reports authored as "Post-mortems" appear as "Mission Reports."
4. **Emitter Alignment**: Verified that `scripts/worker.ts` correctly emits "Mission Report" events and memo body text.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/components/event-log/EventLogClient.tsx`
- `frontend/lib/llm-client.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.12 - Silent Failure & Hanging Task Elimination

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — 8 critical bugs eliminated across the goal → task → approval execution pipeline. Type-check clean.  
**Impact**: Goals, tasks, and approvals now reach terminal states deterministically. No task can silently hang in `running`, no goal can stay stuck in `executing`, and the chain reaction cascades reliably across the full waterfall.

### Bugs Fixed

1. **Goal never auto-completed** (`llm-client.ts`): `runOrcReport` was called when all tasks finished but the goal status was never updated. Goal stayed stuck in `executing` forever. Fix: added `goals.update({ status: 'completed' })` after `runOrcReport`.

2. **Task stuck `running` after approval rejected** (`approvals/[id]/route.ts`): When a founder rejected an approval, the linked `goal_task` (via `__task_id` in payload) was never updated. Fix: on rejection, mark linked task `rejected` and fire CHAIN_REACTION so downstream tasks can unblock.

3. **Task stuck `running` after approval execution failure** (`approvals/[id]/route.ts`): When Composio/internal tool execution threw, the approval was marked `failed` but the linked `goal_task` was not. Fix: in the execution catch block, update linked task to `failed`.

4. **LiteLLM fetch had no timeout** (`llm-client.ts`): If LiteLLM was slow or unreachable, `callLiteLLM` hung indefinitely, causing goals to stay in `planning` and tasks in `running` with no recovery. Fix: added `signal: AbortSignal.timeout(90_000)`.

5. **Department stuck `running` on LLM error** (`llm-client.ts`): If `callLLM` threw, `runWorkerTask` propagated the error without resetting department status. Fix: wrapped the full execution body in try/catch; catch resets department to `error`.

6. **`goal_tasks` stuck `running` if memo insert failed** (`llm-client.ts`): `goal_tasks.update` came after `company_memos.insert`. A memo DB failure left the task in `running` permanently. Fix: moved task status update before memo insert; wrapped memo insert in its own try/catch (non-fatal).

7. **Dead approval filter in dispatch** (`dispatch/route.ts`): The approval expiry check filtered on `action_type: 'task_approval'` — a value never inserted into the DB. The entire block was dead code. Fix: removed the block.

8. **CHAIN_REACTION missed `pending` tasks** (`dispatch/route.ts`): Chain reaction only scanned for `planned` tasks. Initial tasks that were never attempted stayed `pending` and were silently skipped, breaking waterfall chains where the founder only dispatched the first task. Fix: chain reaction now also scans `pending` tasks with no blockers.

### Files Changed
- `frontend/lib/llm-client.ts`
- `frontend/app/api/approvals/[id]/route.ts`
- `frontend/app/api/goals/[id]/dispatch/route.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.11 - Suggested Next Actions Layer

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — App code verified, backend migration required via dashboard  
**Impact**: Resolved critical Spec Gap #1 and established the canonical follow-through layer via `SuggestedAction` integration. Required for the "Beat 9 Magic Moment."

### Changes
1. **Schema & Types**: Created Supabase migration `20260424_add_suggested_actions.sql` and updated TypeScript interfaces for `SuggestedAction` and `SuggestedActionStatus` mapping perfectly to Spec §6.1. Added `suggested_actions` field to `Artifact`.
2. **Action Generator**: Added `suggested-actions.ts` helper tool that automatically produces common follow-up actions (`make_changes`, `add_to_memo`, `send_to_email`) correctly formatted and scored as a DB insert array.
3. **Execution Injection**: Updated `llm-client.ts` to call the generator tool dynamically during `runWorkerTask` and `runOrcReport`. Actions generate implicitly on completion without extra latency or prompts.
4. **UI Chip Cards**: Delivered `SuggestedActionChips.tsx`, resolving the presentation layer in two surfaces across the app. Added chips to the `WarRoom` (Orc completion reporting) and `ArtifactCard` detail pane.

### Files Changed
- `frontend/types/index.ts`
- `frontend/lib/suggested-actions.ts` (NEW)
- `frontend/lib/llm-client.ts`
- `frontend/components/suggested-actions/SuggestedActionChips.tsx` (NEW)
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `supabase/migrations/20260424_add_suggested_actions.sql`
- `Spec_Review_v2.md`
- `CROST_MASTER.md` (this entry)

---

## Session v11.10 - Failure Card Enrichment & Event Log Deep-Linking

**Date**: April 24, 2026  
**Status**: ✅ COMPLETE — Verified local, zero egress impact  
**Impact**: Resolved the "opaque failure" UX issue. Founders now see exactly why an orchestrator failed (inline) and can deep-link into a pre-filtered event log.

### Changes
1. **Dynamic Failure Detail**: Added `goalErrorEvents` state to `WarRoom.tsx` with a one-shot `useEffect` that fetches the last 3 error/task_failed events only when a goal status flips to `failed`. 
2. **Failure Card UI Enrichment**: Overhauled the failure indicator in the War Room to show inline error descriptions with timestamps and a direct link to the full log.
3. **Event Log Deep-Linking**: Updated `dashboard/event-log/page.tsx` to accept `goal_id` and `type` searchParams. The server-side query now pre-filters the initial 50 events to the specific goal ID if provided.
4. **Targeted Filter UI**: Enhanced `EventLogClient.tsx` to respect initial props. Added a red-tinted **Goal Scope Banner** that activates when arriving from a deep-link, ensuring the user knows they are looking at a filtered view and providing a "clear filter" action.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/app/dashboard/event-log/page.tsx`
- `frontend/components/event-log/EventLogClient.tsx`
- `CROST_MASTER.md` (this entry)


## Session v11.9 - Skills Layer & Schema Alignment

**Date**: April 23, 2026  
**Status**: ✅ COMPLETE — Verified local, migration generated  
**Impact**: Resolved critical Spec gaps #2, #6, and #13. Established the "Skills Layer" as the primary lever for high-quality artefact production.

### Changes
1. **Skills Layer Infrastructure**: 
   - Created 5 production-grade SKILL.md files under `frontend/lib/skills/` (pptx, docx, xlsx, pdf, pitch_deck).
   - Implemented `loadSkillsForTask` in `frontend/lib/skills/index.ts` to dynamically resolve and load skill guidance based on task action and params.
2. **LLM Prompt Injection**: 
   - Enhanced `buildFinalPrompt` in `llm-client.ts` to support a new `## SKILLS GUIDANCE` section.
   - Updated `runWorkerTask` to inject detected skills into the model prompt at task time.
3. **Schema Alignment (Spec §9)**:
   - Extended `artifact_type` enum to include `presentation` and `pdf` in both TypeScript and Zod schemas (Gap #6).
   - Added `skills_used` tracking to the `Artifact` interface, Zod schema, and DB insert logic (Gap #2).
   - Enforced `file_url` as a required, non-nullable string to align with the "no body fields" spec requirement (Gap #13).
4. **Database Migration**: 
   - Generated Supabase migration `20260423_add_skills_used_to_artifacts.sql` to add the `skills_used` text array column to the `artifacts` table with a GIN index for analytics.

### Files Changed
- `frontend/types/index.ts`
- `frontend/app/api/artifacts/route.ts`
- `frontend/lib/llm-client.ts`
- `frontend/lib/skills/index.ts` (NEW)
- `frontend/lib/skills/{pptx,docx,xlsx,pdf,pitch_deck}/SKILL.md` (NEW)
- `supabase/migrations/20260423_add_skills_used_to_artifacts.sql` (NEW)
- `CROST_MASTER.md` (this entry)


## Session v11.8 - Type Error & Build Stability Fix

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Resolved duplicate identifier errors preventing production builds.

### Changes
1. **Type Cleanup**: Removed duplicate `is_orchestrator` identifier in `frontend/types/index.ts` within the `Department` interface.
2. **Event Registry Polish**: Cleaned up duplicate `goal_mission_report_written` event type in the global types file.
3. **Build Verified**: Confirmed successful production build via `npm run build`.

### Files Changed
- `frontend/types/index.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.7 - ChatCommandMenu Positioning Fix

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Ensured the mention/tool menu is correctly positioned and visible when triggered.

### Changes
1. **Inner Container Positioning**: Added `position: relative` to the internal padding `div` of the `GoalInput`, ensuring that the absolute-positioned `ChatCommandMenu` is anchored correctly above the input area instead of floating relative to the entire outer container.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v11.6 - Mention Menu & Placeholder Fixes

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Restored functionality for @ and / triggers in the War Room and improved user discovery through updated placeholders.

### Changes
1. **Container Visibility Fix**: Changed `GoalInput` container from `overflow: hidden` to `overflow: visible` and added `position: relative`, ensuring the absolute-positioned `ChatCommandMenu` is visible when triggered.
2. **Type Safety Alignment**: Added missing `is_orchestrator` field to the `Department` interface in `types/index.ts`, preventing runtime issues in component logic.
3. **Filter Relaxation**: Updated `ChatCommandMenu.tsx` to include departments in the `draft` stage, ensuring new users in onboarding can see and use their newly created departments.
4. **Placeholder Enhancement**: Updated the War Room textarea placeholder to include explicit hints for `@ dept` and `/ tool` interaction modes.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/components/chat/ChatCommandMenu.tsx`
- `frontend/types/index.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.5 - Tool Connection Sync & Healing

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Resolved issue where Orc failed to recognize connected tools (Gmail, Slack, etc.) despite successful Composio authentication.

### Changes
1. **Sync Route Schema Fix**: Corrected `api/connect/sync/route.ts` to use valid Supabase column names (`user_id`, `tool_slug`) and enforced the `status='connected'` constraint required by the execution engine.
2. **Just-in-Time (JIT) Syncing**: Enhanced `executeToolCall.ts` with a reactive healing mechanism. If the database shows a tool as disconnected, the system now performs a real-time check against the Composio API.
3. **Connection Auto-Healing**: If a JIT check confirms a tool is active in Composio, the system automatically "heals" the local database records (both `connections` and `available_tools`) before proceeding with the execution.
4. **Improved Error Feedback**: Standardized "missing connection" messaging across the system to ensure Orc provides clear, actionable instructions to the founder.

### Files Changed
- `frontend/app/api/connect/sync/route.ts`
- `frontend/lib/tools/execute-tool-call.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.4 - War Room Button Logic Fix

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Restored the intended interaction behavior where the primary action button dynamically updates its label based on user input.

### Changes
1. **Dynamic Button Labeling**: Fixed the logic in `WarRoom.tsx` to ensure the button flips from "NEW GOAL" to "DISPATCH" as soon as the user starts typing, providing clearer interactive feedback while preserving the state of the active mission when input is empty.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v11.3 - War Room Input Polish

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Enhanced the primary user interface surface (War Room Goal Input) for better visual hierarchy and a more premium feel.

### Changes
1. **Structural Layout Overhaul**: Separated the Goal Input into a distinct header and input area using a cleaner, dashboard-style container.
2. **Typography & Metadata**: Standardized metadata (shortcuts and interaction modes) using `var(--font-dm-mono)` with subtle pill-style backgrounds for better legibility and aesthetics.
3. **Interactive Polish**: Updated the status indicator (indicator dot) with improved pulsing animations and consistent color tokens.
4. **Input Optimization**: Increased font size and line height in the primary textarea for a more comfortable typing experience, aligning with the "Founder first" design principle.
5. **Button Styling**: Refined the DISPATCH button with consistent weighting, letter-spacing, and shadow states to match the premium design system.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v11.2 - Security Hardening & Dependency Audit

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Eliminated critical vulnerabilities and hardened the frontend dependency tree.

### Changes
1. **Critical Patch for Next.js**: Updated `next` from `14.2.5` to `14.2.35`, resolving multiple critical security advisories (Cache Poisoning, DoS, SSRF).
2. **Supabase SSR Upgrade**: Upgraded `@supabase/ssr` to `0.10.2` to resolve vulnerable `cookie` dependencies.
3. **Type Safety Fixes**: Resolved TypeScript errors in `lib/supabase-browser.ts` and `lib/supabase.ts` introduced by the `@supabase/ssr` upgrade (casted `sameSite` to strict `'lax'` literal).
4. **Official SheetJS Distribution**: Migrated `xlsx` from the abandoned npm package to the official SheetJS registry (`https://cdn.sheetjs.com/`) to fix prototype pollution and ReDoS vulnerabilities.
5. **Dev Tooling Update**: Updated `eslint-config-next` to `14.2.15` to reduce high-severity vulnerabilities in dev dependencies.
6. **Build Verification**: Confirmed full production build stability with `npm run build` after dependency updates.

### Files Changed
- `frontend/package.json`
- `frontend/lib/supabase-browser.ts`
- `frontend/lib/supabase.ts`
- `CROST_MASTER.md` (this entry)

---

## Session v11.1 - Live Events Persistence & Task Approval State Fixes

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE  
**Impact**: Resolved two related issues: (1) live events sidebar losing all events on navigation to hidden pages; (2) tasks showing Approve buttons again after navigating away and back, appearing stuck in "APPROVED — ACTION EXECUTING" indefinitely.

### Root Causes

**Problem 1 — Live Events Lost on Navigation**  
`ContentWrapper.tsx` used conditional rendering (`{!isHidden && <LiveEventsPanel />}`) to hide the sidebar on certain pages (settings, knowledge, memos, approvals, artifacts). This caused the component to fully unmount, destroying the Supabase real-time subscription and all accumulated event state. On remounting, the panel received only the stale `initial` prop from the server layout's first render, missing all events that arrived while navigated away.

**Problem 2 — Tasks Stuck in "APPROVED — ACTION EXECUTING"**  
Two sub-bugs sharing the same root (local UI state not surviving navigation):

- **2a**: `decisions` state (local to WarRoom) reset on component remount. `TaskApprovalItem` branched on `decision` (local) rather than checking DB task status, so already-running/completed tasks re-showed Approve buttons after navigation. The display condition `{decision ? status : buttons}` ignored `dbTask.status` entirely for this check.

- **2b**: `ApprovalCard` showed "APPROVED — ACTION EXECUTING" permanently after a Composio tool was approved and executed. The API response includes `execution_status: 'executed'` but this was never reflected in the UI label.

### Changes

1. **ContentWrapper.tsx**: Always render `<LiveEventsPanel>` — removed the conditional and passed `isHidden` prop instead, so the panel hides via CSS (`display: none`) rather than unmounting. Subscription and event state now survive navigation.

2. **LiveEventsPanel.tsx**: Added `isHidden?: boolean` prop; applies `style={{ display: 'none' }}` on the root div when hidden.

3. **WarRoom.tsx — `InlineMessage` type**: Added `approvalExecuted?: boolean` field.

4. **WarRoom.tsx — `ApprovalCard`**: Label now shows `'✓ ACTION EXECUTED'` when `msg.approvalExecuted === true`, falling back to `'✓ APPROVED — ACTION EXECUTING'` when execution is still async.

5. **WarRoom.tsx — `handleApprovalDecision`**: Reads `json.execution_status === 'executed'` from the PATCH response and stores it as `approvalExecuted` on the message.

6. **WarRoom.tsx — `TaskApprovalItem`**: Introduced `isDbActioned` (checks DB task status against a set of terminal/running statuses) and `isActioned = !!(decision) || isDbActioned`. The button/status branch now uses `isActioned` instead of `decision`, so running/completed DB tasks never re-show Approve buttons.

7. **WarRoom.tsx — decisions initialization**: The `decisions` effect (previously `setDecisions({})` on goal ID change) now pre-populates decisions from `activeGoal.goal_tasks` DB state. Rejected DB tasks map to `'rejected'`; all other actioned statuses map to `'approved'`. This ensures `pendingCount` and `allDone` in PlanCard are accurate after navigation.

### Files Changed
- `frontend/components/dashboard/ContentWrapper.tsx`
- `frontend/components/dashboard/LiveEventsPanel.tsx`
- `frontend/components/war-room/WarRoom.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v11.0 - Chat Mention Icon Fix

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Resolved issue where @ mentions for departments showed raw icon slugs (e.g., 'marketing') instead of emojis.

### Changes
1. **ChatCommandMenu Fix**: Updated the department mapping logic in `ChatCommandMenu.tsx` to use the `resolveIcon` utility, ensuring legacy icon names are correctly transformed into emojis.

### Files Changed
- `frontend/components/chat/ChatCommandMenu.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v10.9 - Build Fixes & Dependency Optimization

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Resolved Render build failure and fixed React hook dependency warnings.

### Changes
1. **ArtifactCard Fix**: Restored `downloadArtifact` and `deleteArtifact` functions that were inadvertently removed during refactoring, resolving the "Cannot find name 'downloadArtifact'" Type error.
2. **React Hook Optimization**: Added missing `departments` dependency to the `handleChatSubmit` useCallback in `WarRoom.tsx`, fixing the ESLint `react-hooks/exhaustive-deps` warning.
3. **Deployment Verified**: Confirmed build stability by addressing both hard type errors and secondary lint warnings.

### Files Changed
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/components/war-room/WarRoom.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v10.8 - UI Consistency & Aesthetic Enhancement

**Date**: April 21, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Achieved consistent UI looks, premium aesthetic, and elegance across the app by standardizing components and refining the design system.

### Changes
1. **Design System Standardization**: Refined `globals.css` to include centralized utility classes for `glass-panel`, `glass-card`, `crost-topbar`, and standardized `artifact-row` and `crost-badge` styles.
2. **Topbar Refactor**: Migrated `Topbar.tsx` from brittle inline styles to the new utility classes, adding a modern glassmorphism blur and improved transition states.
3. **Artifact UI Upgrade**: Overhauled `ArtifactCard.tsx` to use the `glass-card` pattern, replacing extensive inline styles with CSS variables and improved hover interactions.
4. **Memo Styling Sync**: Updated `MemoCard.tsx` to align with the premium glassmorphism aesthetic, ensuring consistent padding, typography, and color tokens.
5. **War Room Polish**: Refactored `GoalInput` and `SynthesisReportCard` in `WarRoom.tsx` to use the refined design tokens, improving focus states and visual hierarchy.
6. **Sidebar Navigation Refinement**: Updated `SidebarNav.tsx` and related CSS to ensure consistent active states and smoother hover transitions across the navigation menu.

### Files Changed
- `frontend/app/globals.css`
- `frontend/components/dashboard/Topbar.tsx`
- `frontend/components/artifacts/ArtifactCard.tsx`
- `frontend/components/memos/MemoCard.tsx`
- `frontend/components/war-room/WarRoom.tsx`
- `frontend/components/dashboard/SidebarNav.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v10.7 - Post-Onboarding Goal 404 Fix

**Date**: April 21, 2026
**Status**: 🛠 IN PROGRESS — local fix, awaiting live QA
**Impact**: Resolves the "⚠ Can't reach the server (HTTP 404). Your goal is still running — retrying…" banner that appeared on the dashboard immediately after completing onboarding.

### Root cause
`activeGoal` is persisted to `localStorage` via zustand (`lib/store.ts` — `partialize` keeps `activeGoal`). The War Room's pending-goal effect early-returned whenever any `activeGoal` existed, so a stale goal from a prior account/session shadowed the fresh onboarding handoff. The 2-second poll loop then hammered `/api/goals/<stale-id>`, which returned 404 (the stale id either no longer exists or belongs to a different tenant), surfacing the banner forever.

### Changes
1. **Onboarding handoff wins**: the pending-goal effect in `WarRoom.tsx` now always consumes `crost-pending-goal-id` when present, replacing any persisted `activeGoal`. If that id 404s, the stale store state is cleared.
2. **404 is terminal during polling**: a 404 from `/api/goals/:id` now stops the interval, clears `activeGoal`, and resets `isSubmittingGoal` — instead of retrying a dead id every 2s and showing the scary banner.

### Files Changed
- `frontend/components/war-room/WarRoom.tsx`
- `CROST_MASTER.md`

---

## Session v10.6 - Onboarding Flow Rebuild, Meet Orc, and Partial Dashboard Resume

**Date**: April 21, 2026  
**Status**: 🛠 IN PROGRESS — local implementation underway  
**Impact**: Rebuilds onboarding around the new route order and fixes the partial-dashboard path so founders can skip after identity is complete without getting stranded.

### Changes
1. **Flow order updated**: onboarding path is now being rebuilt as `Auth → Identity → Control Style → Meet Orc → Team → First Mission → Dashboard while processing`.
2. **New Meet Orc step**: added a dedicated onboarding route between Control Style and Team to introduce Orc before department selection.
3. **Partial dashboard access**: dashboard route gating was relaxed for authenticated but incomplete founders, and the dashboard now surfaces a `Resume setup` banner instead of forcing a hard redirect back into onboarding.
4. **Skip behavior normalized**: skipping from post-identity onboarding stages now persists partial onboarding data, writes founder/company context needed for the dashboard, and preserves the next resume step.
5. **Back navigation restored**: onboarding stages now include explicit back affordances so founders can move backward through the flow without relying on browser history.
6. **Founder profile layout fix**: onboarding shell was refactored away from the floating fixed-position profile card that was overlapping page content on desktop.
7. **Team selection cleanup**: removed the hardcoded `Cloud Optimizer` placeholder, switched to real department model badges, and added the correct unselected `Add later` affordance.
8. **First mission suggestions**: goal suggestions are being surfaced as clickable chips that fill the composer while remaining fully editable.
9. **Spec updated**: `CROST_SPEC.md` was clarified to reflect the new onboarding skip timing, clickable suggestion-chip behavior, and explicit back-navigation requirement.

### Files Changed
- `frontend/app/onboarding/page.tsx`
- `frontend/app/onboarding/identity/page.tsx`
- `frontend/app/onboarding/control/page.tsx`
- `frontend/app/onboarding/orc/page.tsx`
- `frontend/app/onboarding/team/page.tsx`
- `frontend/app/onboarding/activate/page.tsx`
- `frontend/components/onboarding/DepartmentCard.tsx`
- `frontend/lib/onboarding-store.ts`
- `frontend/app/globals.css`
- `frontend/middleware.ts`
- `frontend/app/auth/callback/route.ts`
- `frontend/app/api/onboarding/set-step/route.ts`
- `frontend/app/api/onboarding/complete-final/route.ts`
- `frontend/app/api/onboarding/complete/route.ts`
- `frontend/app/dashboard/page.tsx`
- `CROST_SPEC.md`
- `CROST_MASTER.md`

---

## Session v10.5 - Centralized Icon Resolution & Mention Fix

**Date**: April 18, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Resolved issue where `@` mentions showed raw icon names (e.g., 'megaphone') instead of icons.

### Changes
1. **Centralized Utility**: Added `ICON_MAP` and `resolveIcon()` function to `frontend/lib/utils.ts` to unify icon resolution logic across the app.
2. **Mention UI Fix**: Updated `ChatCommandMenu.tsx` to use the new `resolveIcon()` utility, ensuring `@` department mentions display visual icons correctly.
3. **Component Refactor**: Updated `DepartmentCard.tsx` to use the centralized utility, removing redundant local mapping logic.

### Files Changed
- `frontend/lib/utils.ts`
- `frontend/components/chat/ChatCommandMenu.tsx`
- `frontend/components/departments/DepartmentCard.tsx`
- `CROST_MASTER.md` (this entry)

---

## Session v10.4 - Favicon Implementation

**Date**: April 18, 2026  
**Status**: ✅ COMPLETE — Verified live  
**Impact**: Added branding consistency across browser tabs.

... [rest of previous content]
