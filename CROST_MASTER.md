> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 6.3  
**Last Updated:** April 13, 2026  
**Deployment Status:** 🚀 Live — Auth boundary hardening, settings routing cleanup, Orc clarification grounding, and department template safety shipped

---

## 1. Current State

### What is Built ✅

**Core Architecture**
- ✅ **State-Driven Agentic Operating System** — Founder goals → Orchestrator plans → Worker tasks → Synthesis reports
- ✅ **LiteLLM Proxy Gateway** — Unified OpenAI-compatible interface for all LLM requests (Groq, Gemini, Claude)
- ✅ **Memo System** — Foundational context + current context for dynamic knowledge injection
- ✅ **Orchestrator (Orc v2.5)** — Chief of Staff that reads state, plans tasks, synthesizes results
- ✅ **Internal Tool Execution Engine** — Real (not mocked) `supabase_query` and `company_memos` tools for research
- ✅ **Strict Waterfall Execution** — Dependency gating verified by both task status AND physical memo existence
- ✅ **BYOK Model Assignment** — Users provide API keys, select models per role (reasoning/execution/utility)
- ✅ **Multi-Tenant Security (RLS)** — Hardened Supabase policies, users only access own goals/memos/tasks
- ✅ **Event-Driven Worker Supervision** — Zero-poll architecture with Realtime subscriptions + watchdog timers

**Frontend & Deployment**
- ✅ **Next.js Frontend** — Dynamic rendering, all 35 API routes with force-dynamic export
- ✅ **Browser/Server Isolation** — Supabase client in lazy singleton (`lib/supabase-browser.ts`), server client separate
- ✅ **Local Font System** — All 14 font files (Syne, DM Mono, DM Sans) locally served, zero external requests
- ✅ **Render Multi-Service Deployment** — crost-frontend (Node), crost-litellm (Docker), crost-worker (Node)
- ✅ **LiteLLM Docker Container** — Python 3.11, model routing, environment variable substitution
- ✅ **Health Check System** — Supabase + LiteLLM gateway verification (simplified in v5.6)

**Security & Data**
- ✅ **No Direct API Calls to Providers** — Frontend credential-agnostic (all requests via LiteLLM)
- ✅ **API Key Management** — User keys stored in `user_api_keys` table (RLS-secured, AES-256-GCM encrypted)
- ✅ **LITELLM_MASTER_KEY** — Proxy authentication for admin operations
- ✅ **Artifact Storage** — Large outputs offloaded to Supabase Storage

**Key Resolver & Usage System (v6.2)**
- ✅ **Unified Key Resolver** — `lib/key-resolver.ts`: 4-case routing tree, exactly ONE key per request
- ✅ **BYOK Key Passthrough** — User key in `body.api_key`; never `extra_body`; master key always in Auth header
- ✅ **Per-User Daily Quota** — 50K system tokens/day per user; hard fail with `SYSTEM_LIMIT_EXCEEDED` + reset time
- ✅ **First-Goal Exemption** — Users with zero prior system usage bypass daily limit (one-time grace)
- ✅ **Bootstrap Routing** — `interpret-business` onboarding route always uses system key, exempt from limits
- ✅ **Usage Logger** — `lib/usage-logger.ts`: `logUsage()` writes to `api_usage_logs` after every LLM call
- ✅ **Static Cost Table** — `lib/cost-table.ts`: USD cost estimates by model (no LiteLLM dependency)
- ✅ **api_usage_logs Table** — Billing-only table (separate from `event_log`); RLS, indexes, per-user per-day queries
- ✅ **Real Usage Meter** — Settings page shows live token bar (green/amber/red), reset time, BYOK bypass indicator
- ✅ **Provider Normalisation** — Canonical slugs: `anthropic | gemini | groq`; DB migrated from `claude`/`google`
- ✅ **Validate Route Fixed** — `extra_body.api_key` removed; `TEST_MODELS` now fully-qualified LiteLLM names
- ✅ **Separated UI Concerns** — `ApiKeysSettings` = key storage only; `ModelAssignmentForm` = routing only (key section removed)

**Prompting & Department Controls (v6.3)**
- ✅ **Auth Boundary Hardening** — Goal dialogue, dispatch, and direct department task routes now require a real signed-in user and enforce tenant ownership
- ✅ **Orc Identity Guard** — Orc prompt assembly now explicitly treats founder identity as context, never self-identity
- ✅ **Clarification Grounding** — Orchestrator prompt now includes recent clarification history and retries once if it repeats the same clarification after a founder reply
- ✅ **Direct Department Chat Writes To Memo** — Department chat completions now persist to `company_memos`
- ✅ **Department Settings Safety** — Founder-editable department settings now support explicit reset to base template instead of silent fallback
- ✅ **Settings Page Routing Visibility** — Settings page now shows model routing controls alongside API key management

### What Works (Tested) ✅

- ✅ Build pipeline: `npm run build` completes with 0 errors
- ✅ Orchestrator generates JSON plans from founder input
- ✅ Task dependency resolution: blocks on incomplete dependencies & missing memos
- ✅ Worker task execution: departments receive instructions, return JSON results
- ✅ Memo persistence: all task outputs saved as company_memos for future context
- ✅ Health endpoint: checks Supabase + LiteLLM gateway only
- ✅ LiteLLM routing: Groq, Gemini, Claude models accessible via unified API
- ✅ Model validation: user API keys tested through LiteLLM before storing
- ✅ Multi-tenant isolation: RLS blocks cross-user data access
- ✅ Goal lifecycle: draft → executing → completed (with post-mortem synthesis)
- ✅ Render deployments: all three services deploy, no build timeout errors
- ✅ Orc cancellation: "Cancel Goal" button in clarification dialogue allows users to escape conversation
- ✅ Key resolver: user BYOK preferred; system fallback; hard quota cap at 50K tokens/day
- ✅ Usage logging: every LLM call writes to `api_usage_logs` with model, tokens, cost estimate, key type
- ✅ Settings usage meter: live bar with actual per-user daily consumption (not hardcoded)
- ✅ Orc clarification: latest founder response now included in the prompt context before re-planning
- ✅ Department settings: founder can edit prompt/tools/constraints/model and explicitly restore base template

### What is Broken / Incomplete ⚠️

- ⚠️ **Render Env Vars Stale** — `CLOUD_MODEL` and `CLOUD_MODEL_WORKER` in Render dashboard still set to `cloud/groq-llama` (code handles this defensively, but should be updated to `groq/llama-3.3-70b-versatile` for clarity)
- ⚠️ **Worker Realtime TIMED_OUT** — Supabase Realtime subscription times out on Render; worker degrades to watchdog-only mode; root cause under investigation (Realtime may need enabling in Supabase project settings)
- ⚠️ **FREE_SYSTEM_DAILY_TOKENS not in Render** — Env var must be set to `50000` in crost-frontend Render service (defaults to 50000 in code if missing, but should be explicit)
- ⚠️ **Orc Prompt Quality Still Needs Tuning** — Repetition risk reduced, but founder-facing copy and clarification heuristics still need deeper product tuning
- ✅ **LiteLLM Model Routing** — Config updated to current Claude 4.6 + Gemini 2.5 Flash models; removed deprecated 1.5 Pro (v6.0)
- ✅ **Finance/All Dept Model Names** — DB migration fixed all `cloud/*` and `local/*` model aliases to valid LiteLLM names (v6.0)
- ✅ **Orchestrator Fallback** — `cloud/groq-llama` legacy aliases now normalized defensively in llm-client.ts (v6.0)
- ✅ **Health Check System** — Now correctly rejects HTML responses from suspended services (v5.9)
- ✅ **Constitution Page** — Always renders editor with 8 core clauses; shows fallback when no DB row exists (v5.9)
- ✅ **Memos Filtering** — Founder clarification dialogues excluded from memo feed (v5.9)
- ✅ **Artifacts Filtering** — TOOL EXECUTION FAILED entries filtered client-side (v5.9)
- ✅ **Settings Identity Persistence** — Company profile fallback query added to pre-populate founder data from onboarding (v5.9)
- ✅ **Onboarding Department Selection** — Global templates now returned alongside user departments; cloning logic fixed (v5.9)
- ✅ **API Keys Encrypted** — AES-256-GCM at rest (`lib/crypto.ts`), requires `USER_API_ENCRYPTION_KEY` in Render env
- ⚠️ **No GPU Support** — LiteLLM runs on standard Render containers (no acceleration)
- ⚠️ **Worker Polling Only** — Single instance constraint; no true Realtime event delegation
- ⚠️ **Artifact Pipeline Partially Repaired** — Worker now stores preview-compatible artifact metadata, but richer inline artifact rendering still needs follow-through
- ✅ **Task Retry/Skip** — Retry + Skip buttons on failed tasks; Skip endpoint at `/api/goals/[id]/tasks/[taskId]`
- ✅ **Goal Cancellation** — Cancel button in War Room header; PATCH `/api/goals/[id]` with `cancelled` status
- ✅ **Approval Expiry Cron** — `crost-approval-expiry` Render cron job runs hourly; requires `CRON_SECRET` env var
- ✅ **UI Model Presets Updated** — All model references updated to current versions across UI, seed.sql, and wizard (v6.0)

---

## 2. In Progress

- 🔄 **Frontend Redeploy** — Latest build (51e26ba) ships Key Resolver System; auto-redeploy triggered on Render
- 🔄 **Render Env Cleanup** — `CLOUD_MODEL`, `CLOUD_MODEL_WORKER`, `FREE_SYSTEM_DAILY_TOKENS` need manual update in Render dashboard
- 🔄 **Worker Realtime Investigation** — Subscription times out; may need Supabase Realtime toggle + network check
- 🔄 **Orc Prompt Polish** — Founder-facing language still needs refinement so clarification feels sharper and less generic

---

## 3. Next Tasks

**CRITICAL PATH (Blocking)**
- [ ] **Set Render Env Vars** — crost-frontend: `CLOUD_MODEL=groq/llama-3.3-70b-versatile`, `CLOUD_MODEL_WORKER=groq/llama-3.3-70b-versatile`, `FREE_SYSTEM_DAILY_TOKENS=50000`
- [ ] **Fix Worker Realtime** — Enable Realtime in Supabase project settings; verify WebSocket reachability from Render
- [ ] **Verify E2E Flow** — Goal → Orc plan → Worker executes → Usage logged → Synthesis report generated

**COMPLETED FIXES (v6.3)**
- [x] **Auth Boundary Hardening** — `/api/goals/[id]/dialogue`, `/api/goals/[id]/dispatch`, and `/api/departments/[slug]/task` now require user auth and tenant scoping
- [x] **Settings Route Auth Fixes** — `/api/settings/models`, `/api/settings/models/validate`, and `/api/usage/today` now read auth from the cookie-aware server client
- [x] **Settings Page Model Routing** — Main settings page now surfaces `ModelAssignmentForm` again with Crost-native styling
- [x] **Orc Identity Handling** — Prompt builder now tells Orc to treat founder identity as context, never self-identity
- [x] **Clarification Retry Guard** — If Orc repeats the same clarification after a founder reply, the system retries once with a force-plan instruction
- [x] **Department Template Reset** — Founder can now reset a customized department back to the base template from the settings screen
- [x] **Direct Department Memo Writes** — Successful department chat replies now persist to `company_memos`
- [x] **Artifact Schema Alignment** — Worker artifact writes now use `preview_url/body/metadata` instead of the broken `file_url` shape

**COMPLETED FIXES (v6.2)**
- [x] **Key Resolver** — `lib/key-resolver.ts`: 4-case routing (bootstrap / no-user / BYOK / system fallback)
- [x] **Per-User Quota** — `checkTokenBudget(userId)` per-user per-day from `api_usage_logs` (was global bug)
- [x] **First-Goal Exemption** — Users with 0 system usage bypass limit on first goal
- [x] **Usage Logger** — `lib/usage-logger.ts`: `logUsage()` writes billing rows post-LLM-call
- [x] **Cost Table** — `lib/cost-table.ts`: static pricing, no LiteLLM dependency
- [x] **api_usage_logs** — New table live in Supabase; RLS + indexes applied
- [x] **user_api_keys + user_model_assignments** — Applied to live DB (were missing)
- [x] **Provider Normalisation** — DB migrated: `claude→anthropic`, `google→gemini`; UI fixed to canonical slugs
- [x] **validate/route.ts** — `extra_body.api_key` removed; fully-qualified TEST_MODELS
- [x] **ApiKeysSettings** — Now saves via `/validate`; real usage meter with progress bar
- [x] **ModelAssignmentForm** — Key section removed; routing-only as per spec
- [x] **Settings Page** — Hardcoded 35% bar replaced with live `UsageSummary` via `/api/usage/today`
- [x] **Worker Debugging** — Added URL/key logging + graceful Realtime timeout handling

**COMPLETED FIXES (v6.1)**
- [x] **Approval Expiry Cron** — Already in render.yaml; hourly scheduler calling `/api/approvals/expire`
- [x] **Goal Cancel Endpoint** — Already in `/api/goals/[id]` PATCH handler; sets status='cancelled'
- [x] **Cancel Button in War Room (PlanCard)** — Already implemented; visible in plan header when executing/awaiting_approval
- [x] **Retry + Skip Buttons** — Already implemented; appear in TaskApprovalItem for failed tasks
- [x] **Orchestrator Cancellation** — "Cancel Goal" button now in OrcDialogue during clarification phase (v6.1)

**COMPLETED FIXES (v5.9)**
- [x] **Health Check** — HTML response rejection added
- [x] **Constitution Page** — Fallback editor rendering
- [x] **Memos Filtering** — Founder clarifications excluded
- [x] **Artifacts Filtering** — TOOL EXECUTION FAILED excluded
- [x] **Settings Identity Persistence** — company_profile fallback query
- [x] **Onboarding Department Selection** — Global template cloning fixed
- [x] **Model Presets** — All Gemini 1.5 Flash → 2.5 Flash
- [x] **Model Standardisation** — Replaced `cloud/*` names with correct LiteLLM prefixes (`gemini/`, `groq/`)
- [x] **Finance Department** — Added template to seed and DB; updated wizard options
- [x] **Constitution** — Verified single source of truth in DB; editor correctly handles core clauses

**PREVIOUSLY COMPLETED**
- [x] **Encrypt User API Keys** — AES-256-GCM via `lib/crypto.ts`, set `USER_API_ENCRYPTION_KEY` in Render dashboard
- [x] **Task Retry/Skip on Failure** — Retry re-dispatches failed task; Skip marks it rejected and unblocks chain
- [x] **Goal Cancellation** — Cancel button in War Room; marks all non-terminal tasks rejected
- [x] **Approval Expiry Cron** — Set `CRON_SECRET` in Render dashboard for `crost-approval-expiry` service

**POST-LAUNCH (Nice to have)**
- [ ] **WebSocket Realtime** — Replace polling with true event delegation for worker tasks
- [ ] **Artifact Preview UI** — Render markdown/JSON artifacts inline in dashboard
- [ ] **OpenAI Provider** — Add `openai` to canonical provider set; update UI, TEST_MODELS, cost table
- [ ] **War Room Limit Banner** — Surface `SYSTEM_LIMIT_EXCEEDED` error inline in War Room (currently shows as generic goal failure)

---

## 4. Decisions Made

| Decision | Rationale | Commit |
|----------|-----------|--------|
| **BYOK Model Assignment** | Users bring their own API keys, assign models to roles (reasoning/execution/utility), system routes through LiteLLM | `5bd3c25`, `d8dc105` |
| **LiteLLM as Unified Gateway** | Single OpenAI-compatible interface for all providers (Groq, Gemini, Claude) eliminates provider-specific SDK bloat | Ongoing |
| **Strict Waterfall Execution** | Tasks block on incomplete dependencies AND memo verification — data-driven sequencing prevents hallucination | Core design |
| **Memo System as Working Memory** | Foundational context (company profile) + current context (recent clarifications) injected into every Orc/worker call | `143b3f8` |
| **Removed Onyx (LLM-Agnostic Tool Router)** | Replaced with direct Orchestrator planning + LiteLLM model selection (simpler, no extra abstraction) | Early |
| **Multi-Tenant RLS from Day 1** | Security hardened: all tables gated by `created_by`; permissive MVP policies deleted | `20260410040000_fix_rls_and_schema` |
| **Event-Driven Worker (Zero Poll)** | Realtime subscriptions + in-memory watchdog timers replace periodic heartbeats (lower egress, faster response) | `scripts/worker.ts` |
| **No Direct Provider API Calls** | Frontend credential-agnostic; all requests via LiteLLM proxy (v5.6 fix) | `7d42cdc` |
| **Force-Dynamic All API Routes** | Next.js static pre-rendering breaks Supabase client at module load; dynamic rendering prevents build-time errors | All 35 routes |
| **Local Font Files** | Zero external network requests during build/runtime; full 14 weights (Syne, DM Mono, DM Sans) | `53c1d84` |
| **Lazy Singleton Browser Client** | `lib/supabase-browser.ts` instantiated only at runtime (never at module load); prevents build-time Supabase initialization error | `lib/supabase-browser.ts` |
| **Health Check via /health/liveliness** | Groq/Gemini direct checks removed (v5.6); only verify LiteLLM gateway (delegating provider health to proxy) | `7d42cdc`, `20dbb4e` |
| **Key Passthrough via body.api_key** | User BYOK passed to LiteLLM in request body (not header, not extra_body); master key always in Authorization header simultaneously | `51e26ba` |
| **Per-User Per-Day Token Quota** | System key usage capped at 50K tokens/user/day from `api_usage_logs`; resets midnight UTC; first goal exempt | `51e26ba` |
| **api_usage_logs ≠ event_log** | Billing and quota data in dedicated table; system events remain in event_log; logUsage() never overlaps logEvent() | `51e26ba` |
| **Provider Canonical Names** | `anthropic / gemini / groq` match LiteLLM prefix convention; `claude` and `google` are deprecated | `51e26ba` |
| **ModelAssignmentForm = routing only** | API keys stored exclusively in ApiKeysSettings → user_api_keys; ModelAssignmentForm touches only model routing preferences | `51e26ba` |

---

## 5. Known Gaps

### Security
- ✅ API keys encrypted at rest (AES-256-GCM via `lib/crypto.ts`) — requires `USER_API_ENCRYPTION_KEY` in Render
- ✅ Per-user token quota hard-blocked — `SYSTEM_LIMIT_EXCEEDED` throws; goal set to `failed`
- No audit log for API key access/rotation

### Performance
- LiteLLM runs on standard Render containers (no GPU acceleration)
- Worker uses polling + watchdog (not true Realtime event delegation)
- No request caching or batch operations

### Features
- Department settings now support safe founder customization + reset to template
- ✅ Task retry/skip now available in War Room on failed tasks
- No conversation branching (single linear goal thread)
- No export/sharing of goals or synthesis reports

### UX
- Orc clarification copy still needs more opinionated founder-facing polish
- No onboarding guidance for first-time users
- No model capability comparison UI

---

## 6. Notes for Next Builder

### Critical Rules
1. **All LLM requests MUST go through LiteLLM proxy** — No direct API calls to Groq, Gemini, Claude, or OpenAI endpoints
2. **LITELLM_BASE_URL must be base URL only** — `https://crost-litellm.onrender.com` NOT `https://crost-litellm.onrender.com/v1` (code appends the path)
3. **Frontend has NO model provider API keys** — Users' keys stay in LiteLLM environment only
4. **Health checks verify LiteLLM, not providers** — Delegate provider health to the proxy
5. **Memo System is the working memory** — Orc decisions depend on foundational + current context; always keep memos up-to-date

### Build Gotchas
- `NODE_ENV=production` in Render: set `npm ci --include=dev` to force devDependencies
- Static pre-rendering breaks Supabase client: all API routes need `export const dynamic = 'force-dynamic'`
- Stale `.next` cache causes module resolution failures: add `rm -rf .next` before build
- Browser client must be lazy singleton in `lib/supabase-browser.ts` (never import at module scope)
- TypeScript must be available at build time (not just devDependencies)

### Deployment Checklist
- [ ] Set `LITELLM_BASE_URL` (base only, no /v1)
- [ ] Set `LITELLM_MASTER_KEY` (any random string, e.g., `sk-litellm-xxxxx`)
- [ ] Set provider API keys: `GROQ_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`
- [ ] Set Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] Set `FREE_SYSTEM_DAILY_TOKENS=50000` in crost-frontend Render env
- [ ] Run all migrations in order (orc_upgrade → rls_policies → multitenant fixes → current_context → user_model_config → create_api_usage_logs)
- [ ] Verify `/api/health` returns all services as `ok`
- [ ] Test onboarding flow (company profile → goal creation)
- [ ] Monitor worker logs for stall detection + escalation

### Architecture Patterns
- **Orchestrator is the only planner** — Departments execute, don't plan
- **Memos are immutable records** — Never mutate; append new findings
- **Dependencies create sequencing** — Strict waterfall prevents concurrent/out-of-order execution
- **Approvals halt execution** — Founder must explicitly approve before next phase
- **Events are the audit trail** — All actions logged to `event_log` for post-mortem analysis

### Testing Strategy
- Unit test: Memo context injection (check Orc sees all relevant memos)
- Unit test: Waterfall gating (verify tasks block on missing dependencies/memos)
- Integration test: Orchestrator → LiteLLM round-trip (mocked LiteLLM response)
- End-to-end: Founder input → Goal → Plan → Worker tasks → Synthesis (live Render)
- Security: Verify RLS blocks cross-user access (test queries from different user contexts)

### Common Pitfalls
- ❌ Adding new departments without updating Orchestrator's available list
- ❌ Using `cloud/*` or `local/*` model aliases — these are legacy naming from v1; use the exact `model_name` from `litellm/config.yaml` (e.g. `groq/llama-3.3-70b-versatile`, `gemini/gemini-2.5-flash`)
- ❌ Using `extra_body.api_key` — user keys MUST be passed as `body.api_key` (top-level) for LiteLLM passthrough
- ❌ Using provider names `'claude'` or `'google'` — canonical names are `'anthropic'` and `'gemini'`
- ❌ Storing API keys in `ModelAssignmentForm` — key management belongs in `ApiKeysSettings` → `user_api_keys` only
- ❌ Calling `logEvent()` for billing data — use `logUsage()` from `lib/usage-logger.ts` instead
- ❌ Modifying task model without checking LiteLLM config has that model
- ❌ Storing large artifacts in memos (use `uploadArtifact()` to offload to Supabase Storage)
- ❌ Calling LLM functions from client components (all LLM logic is server-side in `lib/llm-client.ts`)
- ❌ Hardcoding API keys or URLs (always use environment variables)
- ❌ Forgetting `force-dynamic` export on new API routes (causes static pre-rendering)

### Version History
| Version | Date | Change |
|---------|------|--------|
| v6.3 | Apr 13 2026 | Auth hardening + settings cleanup: dialogue/dispatch/department-task tenant checks, settings auth fixes, settings page model-routing restored, Orc identity + clarification grounding improvements, department reset-to-template safety, direct chat memo persistence, artifact write-shape repair |
| v6.2 | Apr 13 2026 | Key Resolver System: unified BYOK routing (key-resolver.ts), per-user daily quota (50K tokens), first-goal exemption, usage logging (usage-logger.ts + api_usage_logs table), static cost table, real settings usage meter, provider name normalisation, extra_body removal, ModelAssignmentForm key section removed |
| v6.1 | Apr 12 2026 | Operational stability complete: "Cancel Goal" button added to OrcDialogue clarification phase; all 4 safety features now active (approval expiry cron, goal cancel, retry/skip, orc cancellation) |
| v6.0 | Apr 11 2026 | LiteLLM model routing overhaul: Claude 4.6 + Gemini 2.5 Flash in config.yaml; defensive model alias normalisation in llm-client.ts; DB migration fixing all dept model_names; seed.sql + wizard updated to current model IDs |
| v5.9 | Apr 11 2026 | 8-bug fix sprint: health check HTML rejection, constitution fallback, memos/artifacts filtering, settings identity persistence, onboarding dept cloning, Gemini 2.5 Flash updates, ESLint fix (explicit field copying) |
| v5.8 | Apr 11 2026 | Baseline for bug fix testing, all core features working |
| v5.6 | Apr 11 2026 | Direct API call removal, no frontend credentials, LiteLLM-only routing |
| v5.5 | Apr 11 2026 | Orchestrator model fix, render.yaml port fix, health endpoint fixes |
| v5.4 | Apr 11 2026 | LiteLLM health check auth fix, model updates (Groq 3.3, Gemini 1.5, Claude 4.6) |
| v5.3 | Apr 10 2026 | Force-dynamic exports, browser/server isolation, font restoration, npm resilience |
| v5.2 | Apr 10 2026 | Worker module resolution fix, ESLint cleanup |
| v5.1 | Apr 10 2026 | Render deployment baseline, health checks, model assignment |
