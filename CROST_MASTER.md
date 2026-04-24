> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 11.13  
**Last Updated:** April 24, 2026  
**Deployment Status:** ✅ COMPLETE — Terminology Canonicalization & Legacy Data Transformation (v11.13).

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
