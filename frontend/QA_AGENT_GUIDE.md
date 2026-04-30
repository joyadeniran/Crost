# Crost QA Agent Guide

> **Audience**: AI agents (Claude Code, GPT-4o, or any agentic system) that need to run,
> extend, or reason about the Crost test suite without any prior conversation context.
>
> **Last updated**: 2026-04-29 | **Suite version**: v1.0

---

## 0. Quick-start

```bash
# 1. Install browsers (one time)
cd frontend && npx playwright install chromium

# 2. Set env vars
export E2E_TEST_EMAIL=<test-account-email>
export E2E_TEST_PASSWORD=<test-account-password>
export PLAYWRIGHT_BASE_URL=http://localhost:3000   # or https://app.crosthq.com

# 3. Run unit tests
npm run test:unit

# 4. Run E2E tests (requires a running dev server OR sets PLAYWRIGHT_BASE_URL to prod)
npm run test:e2e

# 5. Run everything
npm run test:all
```

---

## 1. Repository layout

```
frontend/
├── tests/
│   ├── e2e/
│   │   ├── fixtures/
│   │   │   ├── auth.setup.ts          # one-time Playwright auth state capture
│   │   │   ├── llm-mocks.ts           # LiteLLM response factories (all AI flows)
│   │   │   └── api-helpers.ts         # REST helpers: createGoal, approveAction, poll…
│   │   ├── .auth/session.json         # generated; gitignored — auth cookies
│   │   ├── auth-security.spec.ts      # 27 cases — auth, middleware, cookies, onboarding
│   │   └── waterfall-lifecycle.spec.ts# 10 suites — full goal→artifact pipeline
│   └── unit/
│       ├── setup.ts                   # Vitest global setup (env vars, fetch mock)
│       ├── llm-client.test.ts         # 18 cases — LLM fallback, token budget, Orc logic
│       ├── utils-errors.test.ts       # 32 cases — ERROR_REGISTRY, formatErrorMessage, utils
│       └── artifact-transformers.test.ts # 30 cases — detectOutputType, all transformer schemas
├── playwright.config.ts
├── vitest.config.ts
├── QA_ARCHITECTURE_REPORT.md          # Detailed findings (7 bugs, fix priority, coverage matrix)
└── QA_AGENT_GUIDE.md                  # ← this file
```

---

## 2. Test framework overview

| Framework | Version | Used for |
|---|---|---|
| **Playwright** | ^1.59 | E2E browser tests against real (or mocked) app |
| **Vitest** | ^4.1 | Unit tests — pure function logic, no browser |
| **@vitest/coverage-v8** | ^4.1 | Code coverage reporting |

**Important**: No test database is provisioned. Unit tests mock Supabase entirely via `vi.mock`. E2E tests use a **real Supabase project** (the same one as production or a staging fork) — they create real goals, tasks, and approvals. Clean up test data after runs or use a dedicated test account whose data can be discarded.

---

## 3. How the LLM is mocked

All E2E tests intercept `POST **/v1/chat/completions` via `page.route()`. No real AI calls are made during tests. Factories live in [`tests/e2e/fixtures/llm-mocks.ts`](tests/e2e/fixtures/llm-mocks.ts):

| Factory | What it returns |
|---|---|
| `orcPlanResponse(goalId)` | Valid 2-task orchestrator plan (marketing → executive) |
| `orcDirectResponse(answer)` | `is_direct_response: true` — no plan spawned |
| `orcHallucinatedDeptResponse()` | Plan with dept `quantum_computing` (invalid) |
| `workerNeedsDataResponse(items)` | `needs_more_data: true` → ❓ BLOCKED state |
| `workerRequestsApprovalResponse()` | `REQUEST_APPROVAL` for `gmail.send_email` |
| `workerCompletedDocumentResponse()` | `skill: "docx"` artifact |
| `workerCompletedResearchResponse()` | `format: "md"` artifact |
| `litellm503Response()` | HTTP 503 — triggers fallback chain |
| `litellm429Response()` | HTTP 429 — triggers fallback chain |

**Sequence pattern** — use `setupLLMSequence(page, [resp1, resp2, ...])` to wire up ordered responses. Each LLM call advances the index.

---

## 4. Auth setup

E2E tests use a shared Playwright storage state (cookies + localStorage). The `auth.setup.ts` project runs first, logs in once, and saves [`tests/e2e/.auth/session.json`](tests/e2e/.auth/session.json). All spec files in the `chromium` project load this state automatically.

**Required env vars**:

```
E2E_TEST_EMAIL      # Supabase user that has completed onboarding
E2E_TEST_PASSWORD   # their password
```

If the test user's `onboarding_step` is not `complete`, the middleware will redirect to `/onboarding` instead of `/dashboard` and most tests will fail. Create a dedicated test account and complete onboarding manually once.

---

## 5. Unit test mocking patterns

### Supabase mock

Every unit test file that imports from `@/lib/llm-client` or `@/lib/tools/execute-tool-call` must declare this mock **before any imports**:

```ts
vi.mock('@/lib/supabase', () => ({
  createClient: vi.fn(() => mockSupabaseClient()),
}))
```

`mockSupabaseClient()` returns a chainable builder that resolves all queries to `{ data: null, error: null }` by default. Override specific methods per test:

```ts
const supabase = mockSupabaseClient()
supabase.from.mockImplementation((table) => {
  if (table === 'goal_tasks') {
    return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({ data: [task] }) }
  }
  return defaultBuilder()
})
```

### fetch mock

`global.fetch` is mocked in `tests/unit/setup.ts`. In each test, configure it with:

```ts
vi.mocked(fetch).mockResolvedValueOnce(litellmResponse('{"is_valid_goal":true,...}'))
```

Use `mockResolvedValueOnce` (not `mockResolvedValue`) so sequential calls get different responses.

---

## 6. Key application contracts you must not break

These invariants are tested and enforced by the suite. Any change to the production code that violates them will cause test failures — that is intentional.

### 6.1 LLM fallback chain order

```
groq/llama-3.3-70b-versatile   ← primary (CLOUD_MODEL)
gemini/gemini-2.0-flash         ← secondary
groq/llama-3.1-8b-instant       ← tertiary (fast fallback)
```

- SYSTEM_LIMIT_EXCEEDED **never** retries — throws immediately.
- Each fallback logs a `provider_fallback` event to `event_log`.

### 6.2 Orchestrator plan validation

Before tasks are inserted, `runOrchestratorTask` checks every task's `dept` against the list of active department slugs. Invalid dept → retry with error context. Max retries: **3** (after the HIGH-1 fix). After 3 failures → set goal to `error`.

### 6.3 HITL risk mode thresholds

| Mode | Auto-executes |
|---|---|
| `careful` | Nothing — everything requires approval |
| `balanced` | `isReadOnly && toolRisk === 'low'` |
| `aggressive` | `isReadOnly && (toolRisk === 'low' \|\| 'medium')` |

`CRITICAL_TOOLS` (`github.delete_branch`, `gmail.delete_email`, `hubspot.delete_contact`) always require approval regardless of mode.

### 6.4 Realtime subscription filters (post-fix)

All `postgres_changes` subscriptions **must** have a user-scoped filter:

| Channel | Table | Required filter |
|---|---|---|
| `event-log-realtime` | `event_log` | `created_by=eq.${userId}` |
| `event-log-live` | `event_log` | `created_by=eq.${userId}` |
| `approvals-page-realtime` | `approval_queue` | `user_id=eq.${userId}` |
| `departments-realtime` | `departments` | `user_id=eq.${userId}` |
| `layout-approvals-${userId}` | `approval_queue` | `user_id=eq.${userId}` ✅ already correct |
| `layout-artifacts-${userId}` | `artifacts` | `created_by=eq.${userId}` ✅ already correct |

### 6.5 ERROR_REGISTRY — never use raw strings in assertions

Always reference codes via the registry:

```ts
// ✅ correct
import { ERROR_REGISTRY } from '@/lib/errors'
expect(result).toBe(ERROR_REGISTRY['CR-TOOL-GMAIL'].founderMessage)

// ❌ wrong — brittle, breaks when copy changes
expect(result).toBe('Unable to access your Gmail account.')
```

### 6.6 Artifact sources shape

Every artifact insert must include:

```ts
sources: {
  memo_ids: string[],
  kb_file_ids: string[],
  tool_calls: Array<{ tool: string, result: unknown }>
}
```

Missing `kb_file_ids` means Knowledge Base citations are untraceable.

### 6.7 `needs_data` BLOCKED state rendering

When a task has `status: 'needs_data'`:
- UI label: `'❓ BLOCKED'`
- Color: `#fb923c` (orange)
- Shows: `orc_notes` field or fallback `'More information to proceed.'`
- Shows: link to `/dashboard/knowledge` labelled `"Add Knowledge"`
- Shows: `"Skip"` and `"Retry"` buttons

---

## 7. Adding new tests

### Adding a new E2E scenario

1. Add a new `test.describe` block in the appropriate spec file, or create a new file under `tests/e2e/`.
2. Use `setupLLMSequence` from `waterfall-lifecycle.spec.ts` as the pattern for mocking LLM calls.
3. If the scenario requires a new LLM response shape, add a factory to `tests/e2e/fixtures/llm-mocks.ts`.
4. Keep test names as full sentences: `'rejecting a task marks it cancelled without infinite polling'`.

### Adding a new unit test

1. Add to the appropriate file in `tests/unit/`.
2. Never use raw error strings — always `ERROR_REGISTRY['CR-XXX'].founderMessage`.
3. Always call `vi.clearAllMocks()` in `beforeEach` (handled globally in `setup.ts`).
4. Mock the minimum surface needed — do not mock the function under test itself.

---

## 8. Known test limitations

| Limitation | Workaround |
|---|---|
| E2E tests require a real Supabase project with a fully onboarded user | Use a dedicated `e2e@yourdomain.com` account |
| Composio external API is intercepted at the `api.composio.dev` level | If Composio changes its base URL, update the route pattern in `waterfall-lifecycle.spec.ts` |
| `provider_fallback` event assertion (`Suite 7`) requires the real event_log API endpoint | If `/api/events` doesn't exist, the assertion is skipped gracefully |
| Realtime WebSocket subscription tests (Suite 10) parse raw WS frames | Supabase client version changes may alter the frame format |
| `runWorkerTask` unit tests assert "does not throw" rather than DB state | Full DB-state assertions belong in integration tests against a real Supabase instance |

---

## 9. Architecture bugs fixed in this session

The following bugs were identified in [`QA_ARCHITECTURE_REPORT.md`](QA_ARCHITECTURE_REPORT.md) and patched:

| ID | Severity | File(s) | What was fixed |
|---|---|---|---|
| CRITICAL-1 | 🔴 | `EventLogClient.tsx`, `LiveEventsPanel.tsx`, `RealtimeProvider.tsx`, `ApprovalsLiveRefresh.tsx` | Added `user_id`/`created_by` filter to all unfiltered `postgres_changes` subscriptions |
| CRITICAL-2 | 🔴 | `app/api/approvals/route.ts`, `lib/tools/execute-tool-call.ts` | Added `'tool_call'` to Zod enum; mapped Composio action to correct `action_type` |
| HIGH-1 | 🟠 | `lib/llm-client.ts` | Added `maxHallucinationRetries = 3` cap to `runOrchestratorTask` |
| HIGH-2 | 🟠 | `lib/llm-client.ts` | Awaited `insertCompanyMemo`; surfaces `CR-DB-MEMO` on failure via `addTaskLog` |
| HIGH-3 | 🟠 | `components/approvals/ApprovalsLiveRefresh.tsx`, War Room polling | Added 404 + terminal-status circuit breaker to all polling loops |

---

## 10. Running the suite against production

```bash
# Point Playwright at the live app
export PLAYWRIGHT_BASE_URL=https://app.crosthq.com

# Auth setup (runs once, saves .auth/session.json)
npx playwright test --project=setup

# Full suite against production
npx playwright test --project=chromium

# View interactive HTML report
npx playwright show-report
```

**Warning**: E2E tests against production create real goals, tasks, and approval queue entries in your live Supabase database. Use a dedicated test account to avoid polluting founder data. The test account must have `onboarding_step = 'complete'` in `user_metadata`.

---

## 11. CI integration

Add to `.github/workflows/test.yml`:

```yaml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci
      - run: cd frontend && npm run test:unit

  e2e-tests:
    runs-on: ubuntu-latest
    env:
      E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}
      E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}
      PLAYWRIGHT_BASE_URL: https://app.crosthq.com
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci
      - run: cd frontend && npx playwright install chromium --with-deps
      - run: cd frontend && npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: frontend/playwright-report/
```
