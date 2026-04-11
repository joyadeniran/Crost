> This is a working document.
> Builders must keep this updated after every major change.

# CROST MASTER (Execution Log)

**Current Version:** 5.6  
**Last Updated:** April 11, 2026  
**Deployment Status:** 🚀 Ready for Production (Pending manual Render config)

---

## 1. Current State

### What is Built ✅

**Core Architecture**
- ✅ **State-Driven Agentic Operating System** — Founder goals → Orchestrator plans → Worker tasks → Synthesis reports
- ✅ **LiteLLM Proxy Gateway** — Unified OpenAI-compatible interface for all LLM requests (Groq, Gemini, Claude)
- ✅ **Memo System** — Foundational context + current context for dynamic knowledge injection
- ✅ **Orchestrator (Orc v2.5)** — Chief of Staff that reads state, plans tasks, synthesizes results
- ✅ **Waterfall Execution Engine** — Strict dependency gating with memo verification (data-driven sequencing)
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
- ✅ **API Key Management** — User keys stored in `user_api_keys` table (RLS-secured)
- ✅ **LITELLM_MASTER_KEY** — Proxy authentication for admin operations
- ✅ **Artifact Storage** — Large outputs offloaded to Supabase Storage

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

### What is Broken / Incomplete ⚠️

- ⚠️ **LITELLM_BASE_URL Path Issue** — Render env var needs manual update to remove `/v1` suffix (causes doubled path like `/v1/chat/completions/v1/chat/completions`)
- ⚠️ **Frontend Redeploy Pending** — Needs to pick up orchestrator model fix (eb74246) + health check fix (8e3504b)
- ⚠️ **API Keys Unencrypted** — Stored as plaintext in DB (needs libsodium or similar encryption)
- ⚠️ **No GPU Support** — LiteLLM runs on standard Render containers (no acceleration)
- ⚠️ **Worker Polling Only** — Single instance constraint; no true Realtime event delegation
- ⚠️ **No Artifact Preview** — Large outputs not rendered in UI, only stored as text
- ⚠️ **No Retry Logic** — Failed tasks don't auto-retry
- ⚠️ **UI Model Presets Outdated** — ModelAssignmentForm still shows deprecated Gemini 3.1 options (partially fixed in v5.6)

---

## 2. In Progress

- 🔄 **Render Deployment** — All three services deployed and running; awaiting health verification
- 🔄 **Frontend Redeploy** — Waiting for manual LITELLM_BASE_URL config in Render dashboard
- 🔄 **End-to-End Testing** — Onboarding → Goal creation → Orchestrator planning → Worker execution → Synthesis report

---

## 3. Next Tasks

- [ ] **Manual Render Config** — Update crost-frontend env var `LITELLM_BASE_URL` from `https://crost-litellm.onrender.com/v1` to `https://crost-litellm.onrender.com` (remove `/v1` path suffix)
- [ ] **Trigger Frontend Redeploy** — Render dashboard → Services → crost-frontend → Manual Deploy
- [ ] **Verify E2E Flow** — Create test goal → Check orchestrator calls LiteLLM → Verify worker executes → Check synthesis report generated
- [ ] **Encrypt User API Keys** — Implement libsodium encryption for `user_api_keys.encrypted_key` column
- [ ] **Update UI Model Presets** — Finalize ModelAssignmentForm/DeptSettingsForm with gemini-2.0-flash or gemini-3.1-pro (when available)
- [ ] **Add Retry Logic** — Implement exponential backoff for failed task re-execution
- [ ] **WebSocket Realtime** — Replace polling with true event delegation for worker tasks
- [ ] **Artifact Preview UI** — Render markdown/JSON artifacts inline in dashboard
- [ ] **Rate Limiting** — Per-user token budget enforcement (already checked but not enforced)

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

---

## 5. Known Gaps

### Security
- API keys stored plaintext in `user_api_keys` table (TODO: encrypt with libsodium)
- No rate limiting enforced per user (token budget checked but not hard-blocked)
- No audit log for API key access/rotation

### Performance
- LiteLLM runs on standard Render containers (no GPU acceleration)
- Worker uses polling + watchdog (not true Realtime event delegation)
- No request caching or batch operations

### Features
- No artifact preview in UI (large outputs stored as text only)
- No retry logic for failed tasks (manual approval required)
- No conversation branching (single linear goal thread)
- No export/sharing of goals or synthesis reports

### UX
- ModelAssignmentForm shows outdated Gemini options (partially fixed v5.6)
- DeptSettingsForm deprecated Claude versions removed (v5.6)
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
- [ ] Run all migrations in order (orc_upgrade → rls_policies → multitenant fixes → current_context → user_model_config)
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
- ❌ Modifying task model without checking LiteLLM config has that model
- ❌ Storing large artifacts in memos (use `uploadArtifact()` to offload to Supabase Storage)
- ❌ Calling LLM functions from client components (all LLM logic is server-side in `lib/llm-client.ts`)
- ❌ Hardcoding API keys or URLs (always use environment variables)
- ❌ Forgetting `force-dynamic` export on new API routes (causes static pre-rendering)

### Version History
| Version | Date | Change |
|---------|------|--------|
| v5.6 | Apr 11 2026 | Direct API call removal, no frontend credentials, LiteLLM-only routing |
| v5.5 | Apr 11 2026 | Orchestrator model fix, render.yaml port fix, health endpoint fixes |
| v5.4 | Apr 11 2026 | LiteLLM health check auth fix, model updates (Groq 3.3, Gemini 1.5, Claude 4.6) |
| v5.3 | Apr 10 2026 | Force-dynamic exports, browser/server isolation, font restoration, npm resilience |
| v5.2 | Apr 10 2026 | Worker module resolution fix, ESLint cleanup |
| v5.1 | Apr 10 2026 | Render deployment baseline, health checks, model assignment |
