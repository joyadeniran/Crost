> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 11.4  
**Last Updated:** April 21, 2026  
**Deployment Status:** ✅ COMPLETE — War Room Button Logic Fix (v11.4).

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
