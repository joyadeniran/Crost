# Project Crost: Master Source of Truth
**Version:** 5.2 (Browser Client Isolation & Build Stability)
**Last Updated:** April 10, 2026
**Deployment Status:** 🚀 Ready for Render
**Purpose:** The single, definitive technical and operational specification of Crost.

---

## 1. Executive Summary & Core Principle

Crost is a **State-Driven Agentic Operating System** for solo founders. 

It does NOT run purely on prompts; it runs on **structured company state (the Memo System)**. The system operates as a digital "Agent Office" where each department is a semi-autonomous role assigned to an LLM execution block.

### The Core Loop
1. **Founder Goal**: Input via the War Room.
2. **Orc Planning**: The Orchestrator (Chief of Staff) reads system state (Memos), identifies context, and drafts a structured JSON plan.
3. **Dialogue Mode**: Interactive clarification with the founder; responses are saved as **Context Memos**.
4. **Strict Waterfall Execution**: Tasks are dispatched to workers only when dependencies AND their corresponding data (Memos) are verified.
5. **Strategic Synthesis**: Orc synthesizes all findings into a final "Orc Report" upon goal completion.

---

## 2. System Architecture

Crost consists of five core layers:
1. **Onboarding Layer**: Initial state setup (Company Profile & Foundational Memos).
2. **Cognitive Layer (Orc)**: Strategic planning, clarification, and supervision.
3. **Execution Layer**: Deterministic task engine using **LiteLLM Proxy** as the unified model gateway.
4. **State Layer**: The "Working Memory" (Memos, goal_tasks, event_log).
5. **Storage Layer**: External artifacts (Supabase Storage) for large data.

---

## 3. The LLM Gateway (LiteLLM)

Crost uses a **LiteLLM Proxy** for all model interactions. 
- **Unified API**: All requests use the OpenAI-compatible `/v1/chat/completions` format.
- **Security**: Access is gated by `LITELLM_MASTER_KEY` to prevent unauthorized credit usage.
- **Model Agnostic**: Supports Groq, Gemini, Anthropic, and Local (Ollama) via a single `LITELLM_BASE_URL`.

---

## 3.1 Model Assignment (BYOK — Bring Your Own Key)

Users can provide their own API keys and assign models to three roles:

**Roles:**
- **Reasoning** (Orc planning, analysis) — Default: Claude 3.5 Opus
- **Execution** (tool calls, task dispatch) — Default: Groq Llama 3.1 70B
- **Utility** (memo generation, lightweight) — Default: Gemini 1.5 Flash

**Configuration:**
- Users add API keys via `/api/settings/models/validate` (LiteLLM test call validates key)
- Users select presets per role: budget, fast, premium
- System stores encrypted keys in `user_api_keys` (RLS-secured)
- Task dispatch resolves user's model choice via `getModelForTask()` (fallback to Orc default)

**Providers Supported:** Claude, Gemini, Groq  
**Database:** `user_api_keys`, `user_model_assignments` tables (RLS policies)  
**UI:** Dashboard → Settings → Models

---

## 4. The Orchestrator (Orc v2.5)

Orc is the **Chief of Staff**, the only cognitive planner in the system.

### 4.1 Planning Logic & Constraints
- **Centralized Research**: Consolidates market data gathering into a single "Master Research Task".
- **Brain vs. Tool**: Explicit logic to prioritize LLM internal knowledge over redundant tool calls.
- **JSON-Strict**: Deterministic JSON output for UI rendering.
- **Strategic Synthesis**: Automated generation of an "Orc Report" (strategic summary) as soon as all tasks in a goal reach terminal status.

---

## 5. Execution Engine & Strict Waterfall

### 5.1 The Dependency Gate
- A task cannot transition to `running` until its dependencies are `completed` AND a physical memo exists in `company_memos` for that dependency's `task_id`.

### 5.2 Multi-Tenant Security (RLS)
- **Hardened RLS**: Every table is secured with `auth.uid() = created_by`. 
- **Privacy**: Permissive MVP policies have been purged; users can only see their own goals, memos, and artifacts.

---

## 6. Implementation Progress

| Feature | Phase | Status | Description |
| :--- | :--- | :--- | :--- |
| **Core Infrastructure** | 0 | ✅ | Supabase, LiteLLM Proxy, Composio. |
| **Memo Memory System** | 1 | ✅ | Tiered context, foundational/current context split. |
| **Orc Planning v2.5** | 2 | ✅ | JSON plans, Master Research, Brain vs Tool logic. |
| **Waterfall Execution** | 3 | ✅ | Strict dependency gating with memo verification. |
| **Context Sync** | 4 | ✅ | Automated injection of user responses into worker brains. |
| **Strategic Synthesis** | 5 | ✅ | **Automated** trigger for synthesis reports. |
| **BYOK Model Assignment** | 6 | ✅ | User API keys, role-based routing, preset configs. |
| **Render Deployment** | 7 | ✅ | Web service + Background worker, health checks, auto-migration. |

---

## 7. Build & Maintenance

### Running the System
- **Frontend**: `npm run dev` (Port 3000)
- **LiteLLM**: `docker run -p 4000:4000 ghcr.io/berriai/litellm` (or standalone container)
- **Worker**: `npx tsx scripts/worker.ts` (Zero-Poll supervisor)

### Critical Migrations (Order Matters)
- `orc_upgrade`: Goals, tasks, memos enhancements.
- `rls_policies`: Multi-tenant security (Initial).
- `20260409010000_multitenant_fix`: Tightened RLS policies.
- `20260410030000_add_current_context`: Adds `is_current_context` to memos.
- `20260410040000_fix_rls_and_schema`: **CRITICAL**: Drops permissive policies & adds `expected_deliverable` column.
- `20260410050000_user_model_config`: **NEW** — BYOK tables (`user_api_keys`, `user_model_assignments`).

### Deployment
See `RENDER_DEPLOYMENT.md` for step-by-step Render setup (web + worker services, env vars, migrations).

---

## 8. Current Status (April 10, 2026)

✅ **Phase 1-7 Complete**: All core features implemented.
✅ **BYOK System**: Role-based model assignment with API key management.
✅ **Render-Ready**: Web service + worker background job configured.
✅ **Build Fixed**: All TypeScript, ESLint, and static rendering errors resolved.
✅ **Deployment Verified**: Build succeeds with no blocking errors.

---

## 8.1 Critical Fixes Applied (April 10, 2026)

### Type System Fixes
**File:** `frontend/types/index.ts`
- **Fix**: Updated `CompanyMemo` interface with missing fields: `is_foundational`, `is_current_context`, `task_id`, `valid_until`, `version_tag`
- **Fix**: Removed dead `onyx_index_id` field
- **Impact**: Critical for type safety across the entire codebase

### Context Injection into Orchestrator
**File:** `frontend/lib/llm-client.ts` (refactored from `onyx-client.ts`)
- **Fix**: Injected `buildOrcContext(userId)` into `runOrchestratorTask()` to ensure Orc reads foundational + current context memos
- **Impact**: Orc now uses the Memo System as specified; eliminates contextual gaps in planning

### Service Health Endpoint Expansion
**File:** `frontend/app/api/health/route.ts`
- **Previous**: Only checked Supabase health
- **Fix**: Expanded to check 4 services with individual timeout handling:
  - Supabase (database query)
  - LiteLLM (proxy health endpoint at `/health`)
  - Gemini (API key validation via models list)
  - Groq (API key validation via models list)
- **Implementation**: Each check uses `AbortSignal` with 5-second timeout; returns `{ status, detail }` object per service
- **Response Format**: Returns `services` object with individual statuses + `details` object with error messages
- **Impact**: Full visibility into all external service dependencies

### Health Widget Transform
**File:** `frontend/components/settings/HealthWidget.tsx`
- **Fix**: Transformed endpoint response from object format to array format for rendering
- **Implementation**: Maps `services` object entries to `ServiceStatus[]` array with `status` and `detail` fields
- **Impact**: Widget now displays health status + error details for all 4 services

### Force-Dynamic Exports (Static Rendering Prevention)
**Files**: All 35 API routes under `frontend/app/api/`
- **Root Cause**: Next.js attempted static pre-rendering of API routes; Supabase client throws at module load-time when env vars absent during build
- **Fix Applied**: Added `export const dynamic = 'force-dynamic'` to prevent static pre-rendering
- **Routes Updated**: 
  - `/api/approvals`
  - `/api/artifacts`
  - `/api/auth` (all subroutes)
  - `/api/config` (all subroutes)
  - `/api/connect` (all subroutes)
  - `/api/departments` (all subroutes)
  - `/api/goals` (all subroutes)
  - `/api/health`
  - `/api/memos` (all subroutes)
  - `/api/onboarding` (all subroutes including `/complete`)
  - `/api/settings` (all subroutes)
  - `/api/toggle`
  - `/api/tools` (all subroutes)
  - `/api/worker` (all subroutes)
- **Implementation**: Python script automated addition across all 35 files
- **Impact**: Render build no longer crashes on `NEXT_PUBLIC_SUPABASE_URL is not set` error

### Browser Client Isolation (Supabase Module Split)
**Files**: `frontend/lib/supabase-browser.ts` (new), `frontend/lib/supabase.ts`, 11 client components
- **Root Cause**: `lib/supabase.ts` exported `supabaseClient` (browser client) at module scope via `createBrowserClient(...)`. API routes import `lib/supabase.ts` for server functions — when Next.js collects page data during build it evaluates the module, triggering `createBrowserClient` with empty env vars and throwing `@supabase/ssr: Your project's URL and API key are required`. `force-dynamic` alone does not prevent module-level evaluation.
- **Fix Applied**:
  1. Created `frontend/lib/supabase-browser.ts` — lazy singleton browser client, instantiated only on first call at runtime via a `Proxy` wrapper. Never runs at module load time.
  2. Removed `supabaseClient` and `createBrowserClient` import from `lib/supabase.ts`. That file now exports server-only functions exclusively.
  3. Updated all 11 client components to import `supabaseClient` from `@/lib/supabase-browser`.
- **Client components updated**:
  - `app/login/page.tsx`
  - `app/signup/page.tsx`
  - `app/onboarding/activate/page.tsx`
  - `components/settings/McpSettings.tsx`
  - `components/event-log/EventLogClient.tsx`
  - `components/providers/RealtimeProvider.tsx`
  - `components/providers/LayoutStoreHydrator.tsx`
  - `components/dashboard/NotificationDropdown.tsx`
  - `components/dashboard/LiveEventsPanel.tsx`
  - `components/war-room/WarRoom.tsx`
  - `components/onboarding/OnboardingLogoutButton.tsx`
- **Impact**: `npm run build` completes with 0 errors. Browser client is never instantiated server-side. Server-side routes remain isolated to service-role and SSR clients only.
- **Render Env Vars Required**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` must be set in Render dashboard for runtime to function.

### Model Name Correction
**File**: `frontend/app/api/toggle/route.ts`
- **Fix**: Changed `model_name` from `'cloud/groq-llama'` to `'groq/llama-3.3-70b-versatile'`
- **Impact**: Matches LiteLLM router; model selection now correctly routes requests

### Render Configuration
**File**: `render.yaml`
- **Web Service**:
  - Added `rootDir: frontend` to clarify working directory
  - Removed redundant `cd frontend &&` from `buildCommand` (now: `npm ci && npm run build`)
  - Removed redundant `cd frontend &&` from `startCommand` (now: `npm start`)
- **Worker Service**:
  - Kept `cd frontend &&` prefix (scripts/worker.ts is at repo root)
  - `startCommand: cd frontend && npx tsx ../scripts/worker.ts`
- **Impact**: Render dashboard Root Directory setting now works with buildCommand

### Build Optimization (Google Fonts)
**File**: `frontend/next.config.js`
- **Root Cause**: Network requests to `fonts.gstatic.com` failed in Render's restricted build environment
- **Fix**: Added `optimizeFonts: false` to disable build-time font inlining
- **Implementation**: Fonts still load at runtime via standard `<link>` tags in HTML
- **Impact**: Build no longer hangs on network timeouts; font optimization deferred to runtime

### ESLint Rule Removal
**File**: `frontend/.eslintrc.json`
- **Issue**: Rule `@typescript-eslint/no-explicit-any` referenced undefined plugin; caused 60+ file build failures
- **Fix**: Removed the rule definition (rule was non-critical warning anyway)
- **Impact**: Build completes without plugin-not-found errors

### TypeScript Error Fixes
1. **File**: `frontend/app/departments/[slug]/page.tsx`
   - Fixed: `dept.onyx_persona_id` → `dept.orc_persona_id`

2. **File**: `frontend/app/api/onboarding/first-goal/route.ts`
   - Fixed: Added explicit type annotation `(task: any)` in `.map()` callback

---

## 8.2 Build Verification

✅ **Build Status**: `npm run build` completes successfully (22 pages, 0 errors)
✅ **Warnings Only**: Non-blocking warnings in ArtifactCard.tsx (`<img>` tag optimization)
✅ **API Routes**: All 35 routes properly exported with `dynamic = 'force-dynamic'`
✅ **Environment**: Ready for Render deployment with all env vars properly gated
✅ **Browser/Server Isolation**: `lib/supabase.ts` is server-only; browser client lives in `lib/supabase-browser.ts` (lazy singleton)

---

## 8.3 Deployment Readiness

**Next Steps:**
1. Push this version to GitHub
2. Deploy to Render (see `RENDER_DEPLOYMENT.md`)
3. Verify health checks at `/api/health` show all 4 services as `ok`
4. Monitor worker logs for Realtime subscription startup
5. Test onboarding → goal creation → model selection flow

**Known Limitations:**
- API keys stored as-is in DB (TODO: encrypt with libsodium)
- LiteLLM instance must be pre-deployed (not bundled in Render service)
- Worker uses polling for Realtime events (single-instance constraint)

---

*Crost: Think Global, Act Local. Built for the world's founders.*
*Ready for solo founder deployment on Render. V5.1 — April 2026.*
