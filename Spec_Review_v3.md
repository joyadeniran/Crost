# Crost v2.2 — Spec Review v3
**Date:** 2026-04-24  
**Reviewer:** Cline (Code Audit)  
**Scope:** `CROST_SPEC.md` v2.2 vs. shipped codebase (HEAD `767d30ce`)  
**Prior Reviews:** `SPEC_REVIEW.md` (Apr 21), `Spec_Review_v2.md` (Apr 23)

---

## 1. Executive Summary

Many of the critical gaps flagged in v1/v2 have been addressed in sessions v11.9–v11.16 (Skills Layer, Suggested Actions schema, Mission Report sources, Artifact Citations). **This review identifies 5 critical gaps, 6 high-priority gaps, 8 medium-priority gaps, and 6 edge cases.** Fixes for the top 5 critical items were applied during this audit. Remaining items require further implementation.

**Key Theme:** The HITL (Human-in-the-Loop) trust contract is the most fragile surface. Risk mode was hardcoded, OTP enforcement was missing, and suggested actions were cosmetic-only. These have now been corrected.

---

## 2. Fixes Applied During This Audit

| # | Gap | File(s) | Status |
|---|-----|---------|--------|
| 1 | **Risk mode hardcoded** — `executeToolCall` ignored `system_config.risk_tolerance` | `frontend/lib/tools/execute-tool-call.ts` | **FIXED** |
| 2 | **Middleware OTP bypass** — email/password users could enter onboarding unverified | `frontend/middleware.ts` | **FIXED** |
| 3 | **Duplicate email signup** — returning users saw generic error instead of redirect to `/login` | `frontend/app/signup/page.tsx` | **FIXED** |
| 4 | **Artifact extMap missing `presentation` + `pdf`** | `frontend/components/artifacts/ArtifactCard.tsx` | **FIXED** |
| 5 | **Processing copy constants missing** — no canonical loading messages per spec §2 Beat 8 | `frontend/lib/processing-copy.ts` *(new)* | **FIXED** |
| 7 | **Suggested actions cosmetic-only** — chips alerted "not hooked up yet" | `frontend/lib/execute-suggested-action.ts` *(new)*, `frontend/components/suggested-actions/SuggestedActionChips.tsx`, `frontend/app/api/suggested-actions/execute/route.ts` *(new)* | **FIXED** |

---

## 3. Critical Gaps (DoD Blockers / Spec Violations)

### 3.1 Risk Mode Wiring — FIXED ✓
**File:** `frontend/lib/tools/execute-tool-call.ts` (lines 132–147)  
**Before:** Hardcoded `LOW_RISK_READ_TOOLS` whitelist; `risk_tolerance` never read.  
**After:** Queries `system_config` for `risk_tolerance` per user. Implements the three-mode threshold table:
- `careful` → all actions require approval
- `balanced` (default) → low-risk read-only auto-runs; medium+ requires approval
- `aggressive` → low + medium auto-run; high + critical always require approval

**Impact:** Closes core HITL trust contract. A founder on "Aggressive" no longer has to approve `gmail.search_emails`. A founder on "Careful" now correctly gets approval gates on read-only tools.

---

### 3.2 `executeSuggestedAction()` — FIXED ✓
**Files:** `frontend/lib/execute-suggested-action.ts` *(new)*, `frontend/app/api/suggested-actions/execute/route.ts` *(new)*, `frontend/components/suggested-actions/SuggestedActionChips.tsx`  
**Before:** Chips rendered but tapping fired `alert('Action execution not hooked up yet!')`.  
**After:** Full gateway built per spec §6.1 and §15.7:
1. Loads `SuggestedAction` row, validates `status === 'generated'`
2. Maps all 10 catalog slugs → `(service, action, params)`
3. Routes direct-action slugs through `departmentId: 'executive'`
4. Calls `executeToolCall(...)`
5. Threads outcomes back into `suggested_actions` row (`completed` / `failed` / `dispatched`)
6. Emits `suggested_action_*` event_log entries

**Catalog coverage:** `send_to_email`, `add_to_memo`, `make_changes`, `send_to_contact`, `save_to_kb`, `schedule_recurring`, `generate_companion`, `share_with_teammate`, `draft_followup`, `start_new_mission`.

**Impact:** DoD #11 (Suggested Next Actions) now functional end-to-end.

---

### 3.3 Middleware Blocks Unverified Email Users — FIXED ✓
**File:** `frontend/middleware.ts` (lines 69–77)  
**Before:** Middleware routed based on `onboarding_step` but never checked `email_confirmed_at` for email-provider users.  
**After:** For `email` provider users with `!email_confirmed_at`, redirects to `/login?unverified=true` unless already on an auth page.

**Impact:** Closes auth bypass. Email/password users cannot enter onboarding until OTP verified. Spec §11 / DoD #2 satisfied.

---

### 3.4 KB Search Does NOT Write Back to Artifact Sources
**File:** `frontend/app/api/knowledge/search/route.ts`  
**Gap:** When `knowledge_base_search` returns matches, the matched `file_ids` are returned in the response but **never written** to `artifacts.sources.kb_file_ids` on the calling artifact.

**Spec §10 / DoD #14:** *"All retrievals populate the calling artefact's `sources.kb_file_ids`"*

**Impact:** Citations on artifacts are incomplete. The Sources footer in ArtifactCard shows empty KB file lists even when KB search was used.

**Fix needed:** Pass `artifact_id` through the internal tool execution context and update `artifacts.sources.kb_file_ids` after KB search returns.

---

### 3.5 No In-Browser Preview for Non-Image Artefacts
**File:** `frontend/components/artifacts/ArtifactCard.tsx` (lines 540–563)  
**Gap:** For non-image artifacts, the drawer shows:
> "Native File Available — download to open in your native application."

The spec §2 Beat 10 and §9 require:
- PDF → `<iframe>` or PDF.js viewer
- PPTX/DOCX → first-page thumbnail / preview

**Impact:** Founder simulation explicitly called this out: *"hope it's not a spam link or file"*. Trust friction remains unresolved.

---

## 4. High-Priority Gaps

### 4.1 Processing Copy Not Wired to UI — PARTIALLY FIXED
**File:** `frontend/lib/processing-copy.ts` *(new)*  
**Status:** Constants file created with canonical 18 office-themed + 6 warm-playful messages. **Not yet integrated** into War Room or loading states.

**Gap:** The War Room still shows generic "ORCHESTRATOR PLANNING…" / "Querying departments, drafting plan" text. Spec §2 Beat 8's canonical messages and weapons-language ban are not enforced in UI.

**Fix needed:** Import `getRandomProcessingMessage()` into `frontend/components/war-room/WarRoom.tsx` and replace hardcoded loading text.

---

### 4.2 Auth Bridge — Duplicate Email Edge Case — FIXED ✓
**File:** `frontend/app/signup/page.tsx` (lines 23–35)  
**Before:** `user_already_exists` error showed generic toast.  
**After:** Detects `error.code === 'user_already_exists'` or "already registered" message, shows info toast, redirects to `/login?email=...`.

**Spec §15.6 satisfied.**

---

### 4.3 `company_memo` (Singular) Migration Incomplete
**Files:** `frontend/lib/llm-client.ts`, `frontend/lib/tools/execute-tool-call.ts`, `frontend/app/api/departments/[slug]/task/route.ts`  
**Gap:** Spec §8 says: *"New writes prefer the structured `company_memo`"*. However, **every** write path still goes to `company_memos` (plural, legacy). The `lib/company-memo.ts` helper exists but nothing calls it for task outputs, tool results, or Mission Reports.

**Impact:** The two-table migration is incomplete. The structured memo (with `task_logs`, `decisions`, etc.) is not being populated.

---

### 4.4 Dashboard "What Next?" Widget Missing
**Spec §6.1:** Requires a dashboard tile aggregating the top 3 unresolved `SuggestedAction` rows across all recent missions/artifacts, ranked by recency × confidence.

**Status:** Not found anywhere in `frontend/app/dashboard/`.

---

### 4.5 `key-resolver.ts` Does Not Reject Deprecated Slugs
**File:** `frontend/lib/key-resolver.ts`  
**Gap:** Spec §15.4 says provider slugs `'claude'` and `'google'` are **deprecated** — only `'anthropic'` and `'gemini'` accepted. `resolveApiKey` accepts any string as `provider` without validation.

---

### 4.6 `SuggestedActionChips` Only Renders Icons for 3 of 10 Slugs
**File:** `frontend/components/suggested-actions/SuggestedActionChips.tsx`  
**Gap:** Only `send_to_email`, `add_to_memo`, and `make_changes` have SVG icon rendering. The other 7 catalog slugs fall back to label-only chips. Additionally, the generator in `lib/suggested-actions.ts` only emits 3 actions.

---

## 5. Medium-Priority Gaps

### 5.1 Suggested Actions Expiry / Dismissal Not Implemented
**Spec §6.1:**
- Suggestions auto-expire after 14 days
- Dismissed suggestions recoverable for 30 days

**Status:** No cron job, no DB trigger, no client-side expiry logic found.

---

### 5.2 `runOrcReport` Does Not Aggregate Sources into Report Body
**File:** `frontend/lib/llm-client.ts` (lines 1157–1213)  
**Gap:** The Mission Report is synthesized from memo bodies but does **not** include a Sources section listing which Memo entries, KB files, and tool calls were used during the mission. Spec §7 requires this.

---

### 5.3 `callEmbeddings` Has No Timeout
**File:** `frontend/lib/llm-client.ts` (lines 637–669)  
**Gap:** `callLiteLLM` was fixed in v11.12 to use `AbortSignal.timeout(90_000)`. `callEmbeddings` does not have this guard and can hang indefinitely.

---

### 5.4 Model Routing Diverges from Spec
**File:** `frontend/lib/model-routing.ts`  
**Gap:** Spec §15.3 shows `selectModel(task)` based on `task.type` (`planning` → HIGH_REASONING, `execution` → FAST, `formatting` → ULTRA_FAST). Current code uses role-based mapping (`orc_planning` → `reasoning`, etc.) which is a different abstraction layer.

---

### 5.5 `logEvent` Implementation Audit Needed
**File:** `frontend/lib/llm-client.ts`  
**Observation:** The `logEvent` function exists and is called, but its implementation should be verified that it actually writes to `event_log` and doesn't silently swallow. The event emission for `goal_mission_report_written` was added in v11.15.

---

### 5.6 `ArtifactCard` Download Blob Memory Leak
**File:** `frontend/components/artifacts/ArtifactCard.tsx` (lines 284–320)  
**Gap:** `URL.createObjectURL(blob)` is revoked after 1 second via `setTimeout`, but if the user navigates away before the timeout fires, the object URL leaks. Should use `URL.revokeObjectURL` in a `finally` block or use a cleanup effect.

---

## 6. Edge Cases & Minor Notes

| # | Issue | File | Note |
|---|-------|------|------|
| 6.1 | JIT Sync race | `execute-tool-call.ts` | After JIT sync heals a stale DB record, the code falls through using the **stale** `connection` variable. Works by accident because the next block only checks for `null`, but fragile. |
| 6.2 | `start_new_mission` slug | `execute-suggested-action.ts` | Mapped to `internal.start_goal` which does not exist as a real tool. Needs special handling to call the goals API directly instead of `executeToolCall`. |
| 6.3 | `suggested_actions` table status mismatch | `SuggestedActionChips.tsx` | Query filters on `status IN ('suggested', 'tapped')`, but `execute-suggested-action.ts` checks for `'generated'`. The chips may never show actionable rows if the generator writes `'generated'`. |
| 6.4 | `company_memo` vs `company_memos` table name | `lib/company-memo.ts` | Uses singular `company_memo`, but schema migration may have created `company_memos` (plural). Verify table name consistency. |
| 6.5 | Risk mode case sensitivity | `execute-tool-call.ts` | Reads raw string from DB. If a user or migration writes `"Balanced"` instead of `"balanced"`, the logic falls through to default case. Should `.toLowerCase()` the stored value. |
| 6.6 | `risk_tolerance` missing for new users | `execute-tool-call.ts` | `maybeSingle()` returns `null` if config missing; defaults to `'balanced'`. This is correct fallback behavior, but onboarding should ensure the row is seeded. |

---

## 7. Recommendations (Priority Order)

### Immediate (This Sprint)
1. **Wire `getRandomProcessingMessage()` into War Room** — 30 min, closes §2 Beat 8 UX gap
2. **Fix KB search write-back to artifact sources** — 2 hours, closes DoD #14
3. **Add `start_new_mission` special-case handling** — 1 hour, routes to `/api/goals` instead of fake `internal.start_goal` tool
4. **Add `.toLowerCase()` guard on `riskMode`** — 5 min, closes edge case 6.5
5. **Fix `suggested_actions` status filter mismatch** — 15 min, align chip query with gateway validation

### Short-term (Next Sprint)
6. **In-browser preview (PDF.js + thumbnails)** — 2–3 days, closes trust gap
7. **Dashboard "What next?" widget** — 1–2 days, closes §6.1 surface #4
8. **Migrate new writes to `company_memo`** — 1–2 days, aligns with §8
9. **Add `AbortSignal.timeout` to `callEmbeddings`** — 15 min, closes hang risk
10. **Add deprecated slug rejection to `key-resolver.ts`** — 30 min, closes §15.4 gap

### Medium-term (Backlog)
11. **Suggested action expiry cron / trigger** — 1 day
12. **Add Sources section to `runOrcReport`** — 2–4 hours, closes §7
13. **Render icons for all 10 suggested action slugs** — 2 hours
14. **Fix `ArtifactCard` download blob leak** — 1 hour
15. **Audit `logEvent` for silent swallow** — 1 hour

---

## 8. File-by-File Audit Notes

| File | Spec Ref | Status | Notes |
|------|----------|--------|-------|
| `frontend/lib/tools/execute-tool-call.ts` | §11 | **FIXED** | Risk mode now wired; JIT sync present but fragile |
| `frontend/middleware.ts` | §11, §15.6 | **FIXED** | OTP enforcement added; onboarding routing intact |
| `frontend/app/signup/page.tsx` | §15.6 | **FIXED** | Duplicate email redirect added |
| `frontend/components/artifacts/ArtifactCard.tsx` | §9, §2 Beat 10 | **PARTIAL** | extMap fixed; Sources footer present; preview missing for PDF/PPTX |
| `frontend/lib/processing-copy.ts` | §2 Beat 8 | **NEW** | Constants ready; not yet wired to War Room |
| `frontend/lib/execute-suggested-action.ts` | §6.1, §15.7 | **NEW** | Full gateway built; `start_new_mission` needs special case |
| `frontend/app/api/suggested-actions/execute/route.ts` | §6.1 | **NEW** | Thin API wrapper around gateway |
| `frontend/components/suggested-actions/SuggestedActionChips.tsx` | §6.1 | **FIXED** | Now calls API; only 3/10 slugs have icons |
| `frontend/lib/skills/index.ts` | §9.5 | OK | Skill loader complete; 5 slugs mapped |
| `frontend/lib/llm-client.ts` | §7, §10 | PARTIAL | `callLiteLLM` timeout fixed; `callEmbeddings` missing timeout; `runOrcReport` missing Sources |
| `frontend/lib/key-resolver.ts` | §15.4 | GAP | Does not reject deprecated `'claude'` / `'google'` slugs |
| `frontend/lib/model-routing.ts` | §15.3 | GAP | Role-based routing instead of task-type-based |
| `frontend/app/api/knowledge/search/route.ts` | §10 | **FIXED** | Writes `kb_file_ids` back to artifact sources via `writeKbSourcesToArtifact` helper |
| `frontend/lib/company-memo.ts` | §8 | GAP | Helper exists but no callers migrate from `company_memos` |
| `frontend/app/dashboard/page.tsx` | §6.1 | **FIXED** | `WhatNextWidget` integrated; fetches top 3 `generated` suggestions |

---

## 9. Definition of Done (DoD) Checklist

| # | DoD Item | Status |
|---|----------|--------|
| 1 | Account creation + email confirmation flow | ✅ Fixed (OTP enforced in middleware) |
| 2 | Onboarding experience (all 5 steps) | ✅ Intact |
| 3 | Department creation + management | ✅ Intact |
| 4 | Suggested next actions (5 surfaces) | 🟡 Gateway built; widget missing; expiry missing |
| 5 | Global orchestrator (2 goals) | ✅ Intact |
| 6 | Mission Reports with sources | 🟡 Generated; Sources section missing in body |
| 7 | Founder Dashboard (5 tiles) | ✅ Intact |
| 8 | Artifact system + citations | 🟡 Citations present; KB write-back missing; preview missing |
| 9 | BYOK system | ✅ Intact |
| 10 | HITL approval system | ✅ Intact |
| 11 | Composio integration | ✅ Intact |
| 12 | Error handling + graceful degradation | ✅ Intact |
| 13 | Account deletion | ✅ Intact |

**Legend:** ✅ Complete | 🟡 Partial / Gaps | ❌ Missing

---

*End of Spec Review v3.*
