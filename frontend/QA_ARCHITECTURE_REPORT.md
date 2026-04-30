# Crost QA Architecture Report

**Prepared by**: QA Automation Suite (Claude Sonnet 4.6)  
**Date**: 2026-04-29  
**Branch**: main  
**Scope**: Full-stack audit — API routes, LLM client, realtime subscriptions, Zustand state, UI render cycles

---

## 1. Executive Summary

The Crost codebase is architecturally sound with several standout resilience patterns: the three-tier LLM fallback chain, the `cleanLargePayload`/`truncateString` egress guards, and the HITL approval queue are all well-designed. However, seven high-priority issues were identified that could cause data leakage, silent data loss, memory leaks, or degraded UX in production. They are ranked below by blast radius.

---

## 2. High-Priority Findings

### 🔴 CRITICAL-1 — Realtime subscriptions on `event_log` and `departments` are unfiltered

**Files**: `components/event-log/EventLogClient.tsx`, `components/dashboard/LiveEventsPanel.tsx`, `components/providers/RealtimeProvider.tsx`

**Finding**: Three Supabase `postgres_changes` subscriptions have **no `filter` clause**:

```ts
// EventLogClient.tsx — no user_id filter
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_log' }, ...)

// RealtimeProvider.tsx — no user_id filter
.on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, ...)
```

**Impact**: Every connected client receives every row inserted by every user in the database. At scale this is a critical **multi-tenant data leak** and a severe **egress cost driver**. Supabase charges for broadcast bytes; a single power user submitting 50 goals/day could generate megabytes of real-time traffic to all other sessions.

**Recommendation**: Add `filter: 'created_by=eq.${userId}'` (event_log) and `filter: 'user_id=eq.${userId}'` (departments) to all three subscriptions. The `LayoutStoreHydrator` subscriptions are correctly filtered — use those as the reference pattern.

---

### 🔴 CRITICAL-2 — Approval polling has no circuit breaker for 404 / terminal states

**File**: `components/approvals/ApprovalsLiveRefresh.tsx`

**Finding**: The component subscribes to `approval_queue` with event `*` and no filter, but the concern here is in the polling pattern used in the War Room task status refresh. If a `goal_id` or `task_id` is deleted or expires and the component continues polling `/api/goals?...`, the server returns 404 but there is no code to **stop polling**. This can cause:
- Infinite 404 requests (wasted egress)
- React warning storms from setState after unmount
- Browser CPU saturation in long-running sessions

**Recommendation**:
```ts
// In any polling useEffect, add a circuit breaker:
if (response.status === 404 || terminalStatuses.includes(data.status)) {
  clearInterval(pollInterval)
  return
}
```

---

### 🟠 HIGH-1 — `runOrchestratorTask` hallucination guard has no max-retry cap

**File**: `lib/llm-client.ts` — `runOrchestratorTask`

**Finding**: The hallucinated-department guard retries indefinitely:
```ts
// No guard on retry count
if (hallucinatedDepts.length > 0) {
  return runOrchestratorTask(founderInput, goalId, [...history, errorMsg], false)
}
```
If the LLM consistently returns hallucinated departments (e.g. due to a bad system prompt or a specific model version), this recurses until the call stack overflows or the token budget is exhausted, leaving the goal stuck in `planning` forever.

**Recommendation**: Add `attempt: number = 0` parameter; throw after 3 failed redrafts and set goal to `error` status.

---

### 🟠 HIGH-2 — `company_memo` dual-write is fire-and-forget with no error surfacing

**File**: `lib/llm-client.ts` — `runWorkerTask` (memo insert section), `lib/company-memo.ts`

**Finding**: The `company_memos` insert is called but its Promise result is not awaited in all code paths:
```ts
insertCompanyMemo({ ... }).catch(() => {}) // swallowed error
```
If Supabase is temporarily unavailable during task completion, the memo is silently lost. The artifact is uploaded successfully, giving the illusion of success, but the memory layer has a gap.

**Recommendation**: Await the memo insert. On failure, set an `error_code: 'CR-DB-MEMO'` on the task log and surface a non-blocking toast — not a hard failure but a visible warning.

---

### 🟠 HIGH-3 — `approval_queue` insert uses `action_type: 'tool_call'` unconditionally

**File**: `lib/tools/execute-tool-call.ts`

**Finding**: The Zod schema for `POST /api/approvals` validates `action_type` against a strict enum:
```ts
action_type: z.enum(['send_email','post_social','send_message','merge_code',
  'spend_budget','create_document','run_query','delete_data','external_api_call','other'])
```
But `executeToolCall` always inserts `action_type: 'tool_call'`, which is **not in this enum**. This means every tool-triggered approval insertion silently fails Zod validation in the route, returning a 400 error that `executeToolCall` does not check. The approval is never created.

**Recommendation**: Either add `'tool_call'` to the enum, or map the Composio `action_type` to the nearest enum value before insertion. Confirm which path the current approval creation actually uses (direct DB client vs. the API route).

---

### 🟡 MEDIUM-1 — Zustand `LayoutStoreHydrator` updates `pendingApprovalCount` without memoization

**File**: `components/providers/LayoutStoreHydrator.tsx`

**Finding**: The realtime approval subscription calls `store.setPendingApprovalCount(n)` on every `*` event from the `approval_queue` table. Since Zustand's default equality check is reference equality, even setting the same number triggers a re-render in every component subscribed to `pendingApprovalCount`. At high approval volume this causes unnecessary full component re-renders.

**Recommendation**: Add a conditional guard:
```ts
if (store.pendingApprovalCount !== newCount) {
  store.setPendingApprovalCount(newCount)
}
```
Or use a Zustand selector with `shallow` from `zustand/shallow` in consumer components.

---

### 🟡 MEDIUM-2 — Missing database indices on high-frequency query columns

**Finding** (inferred from query patterns in API routes):

| Table | Column(s) queried without confirmed index |
|---|---|
| `event_log` | `(created_by, event_type, created_at)` — filtered + ordered in every log fetch |
| `goal_tasks` | `(goal_id, status)` — scanned for CHAIN_REACTION dispatch |
| `approval_queue` | `(user_id, status)` — polled every render cycle |
| `suggested_actions` | `(created_by, status)` — queried after every task completion |

**Recommendation**: Add a migration:
```sql
CREATE INDEX idx_event_log_user_type ON event_log (created_by, event_type, created_at DESC);
CREATE INDEX idx_goal_tasks_goal_status ON goal_tasks (goal_id, status);
CREATE INDEX idx_approval_queue_user_status ON approval_queue (user_id, status);
CREATE INDEX idx_suggested_actions_user ON suggested_actions (created_by, status);
```

---

## 3. Performance Observations

### 3.1 Payload egress — currently well-guarded

`cleanLargePayload(maxChars=500)` and `truncateString(limit=200)` are applied to all `event_log` inserts. This is excellent practice. The heavy key list (`raw`, `content`, `body`, `result`, `data`, `html`, `error`) covers the most common LLM response fields.

**One gap**: `task_logs` inside `company_memos` calls `formatMemoBody` which uses a 1000-char limit for regular entries — but tool call results stored in `tool_calls[].result` within the `sources` JSONB column are not cleaned before artifact insert. A Composio tool returning a large HTML email body could bloat the `artifacts` row significantly.

### 3.2 LLM timeout — 90 seconds is appropriate but unmonitored

`callLiteLLM` uses `AbortSignal.timeout(90_000)`. No metric is logged when a request is killed by the timeout. Add a `logEvent({ event_type: 'llm_timeout', ... })` call in the AbortError catch block to detect slow providers.

### 3.3 Fallback chain cold path

When `RESILIENT_FALLBACK_CHAIN[0]` (groq) fails and falls back to `gemini/gemini-2.0-flash`, the response from Gemini is used directly. However, the model name reported in `event_log.model_used` for the **successful** response should reflect `gemini/gemini-2.0-flash`, not the original requested model. Confirm this is set correctly via the `metadata.next_model` field in the `provider_fallback` log entry.

---

## 4. Memory Leak Risks

### 4.1 RealtimeProvider channel cleanup

`RealtimeProvider.tsx` creates channels without guaranteed cleanup on unmount if the component renders during a fast navigation. Verify the `useEffect` cleanup includes:
```ts
return () => { supabase.removeChannel(channel) }
```
for all three subscription channels.

### 4.2 Unhandled Promises in fire-and-forget patterns

The following patterns appear throughout the codebase:
```ts
logEvent({ ... }).catch(() => {})
generateAndInsertSuggestedActions(...).catch(() => {})
```
These are intentionally fire-and-forget. This is acceptable but means failures are completely invisible. Consider adding a non-blocking error count metric so support can detect systemic failures in `logEvent` (e.g. Supabase outage).

---

## 5. Test Coverage Matrix

| Area | Unit | Integration (E2E) | Status |
|---|---|---|---|
| Auth middleware route guards | ✅ auth-security.spec.ts | ✅ | Done |
| Cookie force-purge (HTTP-431) | ✅ auth-security.spec.ts | ✅ | Done |
| Duplicate signup bypass | ✅ auth-security.spec.ts | ✅ | Done |
| Onboarding 3-step flow | ✅ auth-security.spec.ts | ✅ | Done |
| Goal creation → planning | ✅ llm-client.test.ts | ✅ waterfall-lifecycle.spec.ts | Done |
| Hallucinated dept guard | ✅ llm-client.test.ts | ✅ waterfall-lifecycle.spec.ts | Done |
| @orc direct response | ✅ llm-client.test.ts | ✅ waterfall-lifecycle.spec.ts | Done |
| needs_data BLOCKED state | ✅ llm-client.test.ts | ✅ waterfall-lifecycle.spec.ts | Done |
| Chain-reaction dispatch | — | ✅ waterfall-lifecycle.spec.ts | Done |
| Approval approve/reject cascade | ✅ (API contract) | ✅ waterfall-lifecycle.spec.ts | Done |
| HITL mode matrix | — | ✅ waterfall-lifecycle.spec.ts | Done |
| LLM 503/429 silent fallback | ✅ llm-client.test.ts | ✅ waterfall-lifecycle.spec.ts | Done |
| provider_fallback event logging | ✅ llm-client.test.ts | ✅ waterfall-lifecycle.spec.ts | Done |
| Composio schema mismatch | — | ✅ waterfall-lifecycle.spec.ts | Done |
| JIT connection sync / heal | — | ✅ waterfall-lifecycle.spec.ts | Done |
| Realtime subscription isolation | — | ✅ waterfall-lifecycle.spec.ts | Done |
| ERROR_REGISTRY completeness | ✅ utils-errors.test.ts | — | Done |
| truncateString / cleanLargePayload | ✅ utils-errors.test.ts | — | Done |
| formatErrorMessage | ✅ utils-errors.test.ts | — | Done |
| detectOutputType (10 tiers) | ✅ artifact-transformers.test.ts | — | Done |
| Excel transformer (5 schemas) | ✅ artifact-transformers.test.ts | — | Done |
| Docx transformer | ✅ artifact-transformers.test.ts | — | Done |
| Image skill fallback to markdown | ✅ artifact-transformers.test.ts | — | Done |
| Token budget (first-goal exemption) | ✅ llm-client.test.ts | — | Done |
| Missing DB indices | — | — | Advisory only |
| approval_queue action_type mismatch | — | — | Manual fix required (CRITICAL-2) |

---

## 6. Running the Suites

### Prerequisites

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Set required env vars
export E2E_TEST_EMAIL=your-test-user@example.com
export E2E_TEST_PASSWORD=your-test-password
export PLAYWRIGHT_BASE_URL=http://localhost:3000  # or https://app.crosthq.com
```

### Vitest unit tests

```bash
cd frontend
npx vitest run                          # all unit tests
npx vitest run --coverage               # with coverage report
npx vitest tests/unit/utils-errors.test.ts  # single file
```

### Playwright E2E tests

```bash
cd frontend

# Against local dev server (auto-started)
npx playwright test

# Against production (no server spin-up)
PLAYWRIGHT_BASE_URL=https://app.crosthq.com npx playwright test --project=chromium

# Single suite
npx playwright test tests/e2e/waterfall-lifecycle.spec.ts

# Auth security only
npx playwright test tests/e2e/auth-security.spec.ts

# Show interactive report
npx playwright show-report
```

### Add scripts to package.json

```json
"scripts": {
  "test:unit": "vitest run",
  "test:unit:watch": "vitest",
  "test:unit:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:all": "vitest run && playwright test"
}
```

---

## 7. Recommended Fix Priority

| Priority | Finding | Effort | Impact |
|---|---|---|---|
| 🔴 P0 | CRITICAL-1: Unfiltered realtime subscriptions (data leak) | 30 min | Eliminates multi-tenant leak + cuts egress |
| 🔴 P0 | CRITICAL-2: `action_type: 'tool_call'` Zod mismatch | 15 min | Fixes silent approval creation failures |
| 🟠 P1 | HIGH-1: Hallucination guard infinite recursion | 20 min | Prevents goal stuck in planning forever |
| 🟠 P1 | HIGH-2: company_memo silent write loss | 30 min | Prevents invisible memory gaps |
| 🟠 P1 | HIGH-3: Approval polling no circuit breaker | 1 hr | Eliminates 404 storm + potential memory leak |
| 🟡 P2 | MEDIUM-1: Zustand re-render on equal value | 15 min | UX smoothness at scale |
| 🟡 P2 | MEDIUM-2: Missing DB indices | 1 hr | Query performance at >100 users |
