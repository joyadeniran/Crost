# Crost — Project Continuity Document
**Version:** 1.0  
**Purpose:** Complete record of all thinking, decisions, specs, and artefacts produced. Share this document to bring any person, team, or AI agent fully up to speed on the Crost project.  
**Last updated:** April 2026

---

## 1. What Is Crost?

Crost is an **Agentic Operating System for solo founders** — built for ambitious operators everywhere who run lean teams and cannot afford to hire a full department. It is not a chatbot. It is not an AI wrapper. It is a structured **Agent Office** where:

- Each "Department" (Engineering, Marketing, Sales, Finance, Operations, or any custom department the founder creates) is a semi-autonomous AI agent with its own persona, toolset, and task queue.
- A founder interacts via a unified dashboard showing what each department is doing in real time.
- Agents can draft and plan freely, but **cannot commit any irreversible action** — sending emails, merging code, spending budget — without explicit founder approval via an **Approval Feed**.
- The system works **offline-first** using local LLMs via Ollama, with a one-click switch to Cloud APIs (Gemini, Claude, Groq) when available.

### Core Positioning

**Think Global, Act Local.** Crost is built for the world's founders — Lagos to Jakarta, Nairobi to São Paulo. There are no hardcoded regional biases in the codebase. Every founder configures their own **Local Identity** at onboarding — tone, market context, cultural nuance — which is injected globally across all department agents.

### Primary Differentiators

| Feature | Why It Matters |
|---|---|
| Online/Local Toggle | $0 cost during dev/offline; high performance when connected |
| Human-in-the-Loop Approval Feed | Founder stays in control; agents cannot act unilaterally |
| Dynamic Department Schema | Any org structure, not limited to preset categories |
| Cross-Department Memo System | Agents share knowledge; no duplicated work or conflicting promises |
| Localised Tone Identity | Output sounds human and contextually right for the founder's market |
| Department Constitution | Shared safety rules inspired by Anthropic's Constitutional AI |

---

## 2. What Crost Learns from Anthropic

Three Anthropic design philosophies are directly implemented in Crost, adapted for an agentic office context.

### A. The Department Constitution (from Constitutional AI)

Every department agent receives a **Crost Constitution** — a set of non-negotiable rules that are prepended to every system prompt, always first, never overridable by any department configuration. Founders can add custom clauses but cannot remove the core eight:

1. NEVER take an irreversible action without calling `request_approval()` first.
2. NEVER fabricate data, metrics, quotes, or facts.
3. NEVER expose credentials, API keys, personal data, or financial figures.
4. NEVER make commitments on behalf of the founder without explicit approval.
5. ALWAYS check `company_memos` before starting a task.
6. ALWAYS surface uncertainty rather than guessing.
7. ALWAYS log task start, completion, and errors.
8. You are a department head. The founder is the CEO.

### B. Capability Declarations (from Model Cards)

Every department declares its `capabilities` and `restrictions` as structured data. These appear in the UI (so founders know exactly what a department can do before activating it) and are also injected into the agent's own prompt to reduce overconfidence and hallucination.

### C. Staged Activation (from Responsible Scaling Policy)

New departments cannot run tasks immediately. They move through a gated lifecycle:

```
draft → review → active → (paused) → (deprecated)
```

A department in `draft` cannot run tasks. Promotion to `review` requires validation checks. Promotion to `active` requires explicit founder confirmation with a review of tools and permissions. This prevents accidental deployment of misconfigured agents.

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Agent Engine | Onyx (forked) | RAG, connectors, tool-calling |
| LLM Router | LiteLLM (via Onyx) | Routes to local or cloud models |
| Local LLM Runtime | Ollama | `gemma3:12b` default |
| Cloud LLM Primary | Google Gemini 1.5 Pro | `cloud/gemini-pro` |
| Cloud LLM Alt | Anthropic Claude 3.5 Sonnet | `cloud/claude-sonnet` |
| Frontend | Next.js 14 App Router + Tailwind CSS | TypeScript strictly |
| UI Components | shadcn/ui | Pre-configured |
| State Management | Zustand | Lightweight global state |
| Database | Supabase (Postgres) | Auth + DB + Realtime |
| Vector Store | Vespa (via Onyx) | RAG and memo indexing |
| Background Jobs | Supabase Edge Functions | Approval expiry, health check |
| Containerisation | Docker + Docker Compose | `onyx-lite` profile for dev |
| Package Manager | pnpm | |
| Type Safety | Zod | All API input/output validation |

### Local Model Selection

| Model | RAM Required | Best For |
|---|---|---|
| `gemma3:12b` | 16GB+ | Default. Best tone adherence, multilingual |
| `gemma3:4b` | 8GB+ | Constrained hardware |
| `llama3:8b` | 12GB+ | Engineering/tool-calling tasks |
| `mistral` | 8GB+ | Emergency fallback |

Gemma 3 is preferred over Llama 3 because it handles multilingual instruction-following and culturally contextualised tone prompts more consistently — critical for Crost's global-first positioning.

---

## 4. Architecture Overview

### The Prompt Assembly Order

Every department agent receives a prompt assembled in this exact order — non-negotiable:

```
1. Crost Constitution        (non-overridable safety rules)
2. Department Persona Prompt (role, responsibilities, rules)
3. Local Identity            (tone and cultural context)
4. Capability Boundaries     (what this dept can/cannot do)
5. Memo Brief                (recent high-priority company memos)
6. Task                      (the founder's instruction)
```

This mirrors how Anthropic structures Claude's prompts — safety rules structurally first, never crowded out by task-specific instructions.

### The Approval Detection Protocol

Agents signal approval requests by including this exact string in their response:

```
REQUEST_APPROVAL: {"action_type": "send_email", "action_label": "...", "payload": {...}, "context": "...", "risk_level": "high"}
```

`onyx-client.ts` parses this with a regex, extracts the payload, creates an approval queue entry in Supabase, and sets the department status to `awaiting_approval`. Execution is paused until the founder approves or rejects via the dashboard.

### Risk Levels by Action Type

| Action | Risk Level |
|---|---|
| `run_query`, `create_document`, `file_reader` | low |
| `post_social`, `send_message`, `external_api_call` | medium |
| `send_email`, `merge_code` | high |
| `spend_budget`, `delete_data` | critical |

---

## 5. Database Schema (6 Migrations)

### departments
Core table. Every department is a row. Key fields:
- `activation_stage` — `draft | review | active | paused | deprecated`
- `status` — `idle | running | awaiting_approval | error | paused`
- `onyx_persona_id` — Onyx's internal ID. `NULL` = not yet created. `'SYNC_FAILED'` = creation failed, retry pending.
- `capabilities`, `restrictions` — JSONB arrays. Required for activation.
- DB trigger blocks reserved slugs: `system, admin, api, memos, approvals, settings, onboarding, health, toggle, status, dashboard, departments, activate, deprecate`

### approval_queue
Pending, approved, rejected, executed, expired, execution_failed actions.
- `department_name` and `department_slug` are denormalised — DB trigger keeps them in sync if department is renamed.
- `expires_at` defaults to 24 hours. Edge function runs hourly to expire stale approvals.

### company_memos
Shared knowledge base across all departments.
- `from_department` (slug, denormalised) — DB trigger syncs on department rename.
- `read_by` — array of department slugs that have read this memo.
- `onyx_index_id` — `NULL` if Vespa indexing failed. Retried on next startup.
- Indexed in Onyx under corpus `company_memos`.

### event_log
Immutable audit trail. Every action writes here. Department deletion sets `department_id` to NULL but preserves the log row. Key `event_type` values include: `task_started`, `task_completed`, `approval_requested`, `department_created`, `department_activated`, `token_limit_hit`, `mode_switched`.

### system_config
Key-value store for runtime configuration. Key rows:
- `env_mode` — `"local"` or `"cloud"`. Toggled by the mode switch. Founder-editable.
- `agent_constitution` — the full constitution text. `is_founder_editable = false` — core clauses cannot be removed.
- `local_identity` — set at onboarding. Injected into every prompt.
- `token_hard_limit_per_session` — default `50000`. Auto-fallback to local when hit.

### available_tools
Registry of all tools that can be assigned to departments. `is_configured` must be `true` for a tool to be assignable. Tools: `github`, `gmail`, `slack`, `supabase_query`, `apollo_mcp`, `web_search`, `file_reader`.

---

## 6. The Department Lifecycle

### Creation (6 Steps)

```
1. Zod validation + reserved slug check + slug uniqueness + tools validation
2. INSERT into departments (activation_stage = 'draft', onyx_persona_id = NULL)
3. Create Onyx persona (non-fatal: if fails, sets onyx_persona_id = 'SYNC_FAILED')
4. Subscribe persona to company_memos corpus in Onyx (non-fatal)
5. Supabase Realtime broadcasts INSERT → new card appears in dashboard automatically
6. Return to UI with activation_stage: 'draft' and any sync warnings
```

### Activation (draft → review → active)

- `draft → review`: Validation checks must all pass (prompt ≥ 50 chars, ≥1 capability, Onyx synced, tools configured). Founder confirms.
- `review → active`: Founder reviews tool permissions and risk levels, ticks confirmation checkbox, confirms. Department is now operational.
- If `persona_prompt` or `tools` are changed on an `active` department: stage resets to `review` automatically. Requires re-activation.

### Deprecation

Soft deprecation only by default:
1. Set `activation_stage = 'deprecated'`, `status = 'idle'`
2. Auto-reject all pending approvals (logged as `system_deprecation`)
3. Deactivate Onyx persona (hidden, not deleted — chat history preserved)
4. Memos, event log, data all preserved

Hard delete only available after soft deprecation, requires typing department name to confirm. Cascade deletes `approval_queue`. Sets `company_memos.from_department_id = NULL` (body preserved).

---

## 7. Key Files — Specifications Written

### `frontend/lib/onyx-client.ts`

The **only** file in the codebase that communicates with Onyx. Everything else goes through it.

Key functions and their roles:

| Function | Role |
|---|---|
| `buildFinalPrompt()` | Assembles Constitution + Persona + Local Identity + Capabilities + Memo Brief. Order is non-negotiable. |
| `runDepartmentTask()` | Executes a task. Manages department status transitions. Detects approval requests in responses. |
| `createOnyxPersona()` | Creates Onyx persona during department creation. |
| `updateOnyxPersona()` | Syncs Onyx when department config changes. |
| `deactivateOnyxPersona()` | Called during soft deprecation. |
| `deleteOnyxPersona()` | Called during hard delete. |
| `getMemoBrief()` | Fetches high/urgent memos the department hasn't read. Injected into prompt. |
| `indexMemoInOnyx()` | Indexes a memo into Vespa. Returns error without throwing — caller handles. |
| `resolveActiveModel()` | Returns the correct model for current `env_mode`. Handles local↔cloud mismatch. |
| `checkTokenBudget()` | Enforces daily token limit. Auto-switches to local if cloud limit hit. |
| `logEvent()` | Writes to `event_log`. Never throws. Always safe to call. |
| `checkOnyxHealth()` | Returns `{ reachable, version }`. Never throws. |

Critical implementation rules:
- Server-side only — never import from a client component
- `runDepartmentTask()` is the **only** function that writes to `departments.status`
- `buildFinalPrompt()` always fetches fresh config — never cache its result
- `resolveActiveModel()` reads `env_mode` on every call — no caching

### `frontend/lib/department-lifecycle.ts`

All department CRUD logic. API routes are thin wrappers around these functions. Every function returns `LifecycleResult<T>` — never throws to the caller.

| Function | Role |
|---|---|
| `createDepartment()` | Full 6-step creation with non-fatal Onyx failure handling |
| `updateDepartment()` | Field-aware updates — prompt/tools change resets stage, model change does not |
| `renameDepartment()` | Slug changes require additional `read_by` array sync |
| `validateForActivation()` | Pure validation — used by UI to enable/disable activate button |
| `activateDepartment()` | Enforces legal stage transitions only (draft→review→active) |
| `deprecateDepartment()` | Auto-rejects pending approvals, deactivates Onyx persona |
| `hardDeleteDepartment()` | Typed-name confirmation, must-be-deprecated-first guard |
| `listDepartments()` | Sorted by stage priority — active first, deprecated last |

---

## 8. API Routes

All under `frontend/app/api/`. All return `ApiResponse<T>`:

```typescript
type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  warning?: string;
  timestamp: string;
}
```

| Route | Method | Function |
|---|---|---|
| `/api/departments` | GET | List all non-deprecated departments |
| `/api/departments` | POST | Create department (calls `createDepartment()`) |
| `/api/departments/[slug]` | GET | Get single department |
| `/api/departments/[slug]` | PATCH | Update department (calls `updateDepartment()`) |
| `/api/departments/[slug]` | DELETE | Deprecate or hard-delete |
| `/api/departments/[slug]/activate` | POST | Advance activation stage |
| `/api/departments/[slug]/rename` | PATCH | Slug change (calls `renameDepartment()`) |
| `/api/departments/[slug]/validate` | GET | Check readiness for activation |
| `/api/departments/[slug]/status` | GET | Live status (polled every 3s for pulse animations) |
| `/api/approvals` | GET | List pending approvals |
| `/api/approvals` | POST | Create approval request (called by agent tools) |
| `/api/approvals/[id]` | PATCH | Approve or reject |
| `/api/approvals/[id]/execute` | POST | Execute approved action |
| `/api/memos` | GET | List memos (filterable by dept, tag, priority) |
| `/api/memos` | POST | Create memo + index in Onyx |
| `/api/toggle` | POST | Switch `env_mode` + broadcast via Realtime |

---

## 9. The Online/Local Toggle

Mode is stored in `system_config` key `env_mode`. Toggling:
1. Updates `system_config`
2. Broadcasts via Supabase Realtime channel — all connected clients update `ModeToggle` immediately
3. All subsequent `runDepartmentTask()` calls use the new mode via `resolveActiveModel()`

**Model mismatch handling:** If a department has a `local/*` model but mode is `cloud`, `resolveActiveModel()` maps to the cloud equivalent automatically (and vice versa). No manual configuration needed when switching modes.

**Token limit enforcement:** Daily tokens are accumulated from `event_log.tokens_used`. At 80% of limit: yellow banner. At 100%: auto-switch to local mode, red banner, `token_limit_hit` event logged. If already in local mode at limit: tasks paused with modal requiring acknowledgment.

---

## 10. Onboarding Flow

The onboarding runs before the dashboard loads on first use. It is a hard gate — `local_identity` must be set before any agent runs.

### Screens (4 + 1 activation moment)

**Screen 0 — System Check** (~10 seconds, automatic)
Scans for Ollama, RAM, internet, GPU. Displays a live checklist. Amber warnings do not block progress. If Ollama is missing: shows "Install Ollama (30 sec)" link and a "Continue with Cloud Mode" option.

**Screen 1 — Identity** (~90 seconds, conversational)
Three questions asked one at a time, each reflected back before the next is asked:
- Name + city/country → "Hey Joy. Building in Lagos — got it."
- Business description (free text) → Crost interprets and reflects: "B2B credit infrastructure for informal retail. Noted."
- Company stage: Idea / MVP / Early Traction / Scaling

**Screen 2 — Control Style** (~15 seconds, single choice)
- Careful — ask before most actions
- Balanced — standard approvals on high-stakes only (default)
- Aggressive — move fast, fewer interruptions

Sets `risk_tolerance` in `system_config` which affects approval thresholds across all departments.

**Screen 3 — Pick Your Team** (~30 seconds, card gallery)
Shows 5 department cards. Founder picks 2–3 to activate first. Unselected departments do not exist yet — dashboard is purposefully curated, not overwhelming.

**Activation Moment** (~60 seconds, live animation)
Selected departments show live progress bars ("Loading brief → Reading context → Ready"). Once complete, a goal input appears: "What's your first objective?" Founder types a goal (e.g. "Get 50 retailers onboarded this month"). Crost distributes across selected departments — they begin drafting immediately. Dashboard opens with departments already working, first approval possibly already waiting.

### What Was Deliberately Cut from Onboarding
- API Key Vault → moved to Settings (blocks momentum)
- Full Constitution reading → shown briefly, full view in Settings
- Tool connection → prompted contextually first time agent needs a tool
- All 5 departments at once → sequential activation, founder feels in control
- Billing/plan setup → after first value moment, not before

---

## 11. UI Design

### Dashboard

**Aesthetic:** Dark industrial command centre. `#09090b` near-black background with grain texture. Warm off-white text. Each department owns an accent colour used across its card, event log dot, and badge.

**Typography:**
- `Syne` — department names, headings (geometric, strong)
- `DM Mono` — all status/data text, model names, timestamps
- `DM Sans` — body text, labels

**Key Components:**
- `ModeToggle` — most prominent element in top bar. LOCAL = green pill, CLOUD = blue pill. Keyboard shortcut: Cmd+Shift+M.
- `DepartmentGrid` — fully dynamic. Adapts from 1 to 50+ departments. Sorted active→review→draft→paused, deprecated collapsed. Always includes "+ New Department" as last card.
- `DepartmentCard` — colour top border, status badge with pulse animation, current task (2 lines, hover for full), model name, token usage bar.
- `PulseIndicator` — CSS animation only, no JS intervals. Running = green pulse, Awaiting Approval = amber pulse (faster).
- `ActivationBadge` — five states with distinct colours: DRAFT (yellow), REVIEW (blue), ACTIVE (green), PAUSED (grey), DEPRECATED (red).
- `CreateDepartmentWizard` — 4-step modal: Identity → Persona → Tools & Model → Review.
- `ApprovalFeedItem` — risk badge, action label, context, collapsible payload preview, Approve/Reject buttons. Expired items greyed out, no actions.
- `MemoCard` — priority-coloured left border (urgent=red, high=amber, normal=grey), department badge, tags as chips.
- Live Event Log sidebar — auto-scrolls, 20 most recent events, updates via Supabase Realtime without page refresh.

**Critical UI Rule:** No component may hardcode a department name, slug, count, or icon. The grid and all feeds render dynamically from the `departments` table.

### Onboarding

**Aesthetic:** Warmer dark than the dashboard — `#0c0c0f` with warm undertones. `Fraunces` serif for headlines (editorial, warm). `DM Mono` for AI reflection blocks. Generous negative space. Deliberately different from the dashboard to signal "setup" vs "operation."

**AI Reflection Block:** Teal left border, `DM Mono` font, subtle teal glow background. Used whenever Crost reflects back the founder's input interpreted. This is the first moment the product feels alive.

**Right Panel:** Builds a live summary of the founder's profile as they answer questions — name, location, business, interpreted category, stage, control style, selected departments. Shows remaining estimated time.

---

## 12. Decisions Made & Rationale

### Why Gemma 3 over Llama 3 as default
Gemma 3 was trained on a broader multilingual corpus and handles Nigerian English, code-switching, and culturally-specific instructions more naturally. Instruction-following is tighter, meaning the Constitution and tone prompts are respected more consistently. Gemma 3 12B outperforms Llama 3 8B on most reasoning benchmarks at similar resource requirements.

### Why Onyx as the engine
Onyx (formerly Danswer) provides RAG, connector management, vector indexing, and tool-calling infrastructure out of the box. Forking it avoids building this from scratch while still allowing full customisation of the UI and persona/department layer.

### Why soft deprecation over hard delete by default
Deleting a department destroys audit history. In a startup context, the founder may need to revisit what a department did, what it promised, what approvals it requested. Soft deprecation preserves everything. Hard delete is available but requires two deliberate steps.

### Why `activation_stage` resets on prompt or tools change
A changed prompt or changed tool set means the founder has not reviewed the current configuration. Requiring re-activation ensures the founder always consciously approves what the agent is allowed to do with its current setup — directly mirroring Anthropic's RSP philosophy.

### Why `LifecycleResult<T>` instead of throws in `department-lifecycle.ts`
API routes need to map errors to HTTP status codes cleanly. Exceptions require nested try/catch in every route and make error handling inconsistent. The result type pattern means every function's failure modes are explicit and typed — the route always knows what went wrong and can respond appropriately.

### Why the memo brief is injected per-call, not cached
Memos can be written by any department at any time. Caching the brief would mean a department could miss a critical memo written moments before it starts a task. Freshness is more important than the minor latency cost of a Supabase query.

### Why tool connection is deferred from onboarding
Connecting tools (OAuth flows, API keys) during onboarding creates friction that causes drop-off before the founder has experienced any value. Instead, tool connection is triggered contextually: when an agent first needs a tool, it surfaces a prompt — "Connect Gmail to let Sales send this outreach." Tool connection becomes a reward for engagement, not a prerequisite for entry.

### On Managed Cloud vs BYOK
The recommendation for MVP is **Bring Your Own Key (BYOK)** — zero overhead, no billing complexity, no liability for API costs. Managed Cloud (Crost proxies API calls, charges a fee) is a Phase 2 revenue model once user volume justifies the infrastructure and compliance work.

---

## 13. Artefacts Produced

| Artefact | Description | Status |
|---|---|---|
| `crost_mvp_spec_v3.md` | Full MVP technical specification v3.0 — architecture, schema, API, lifecycle, edge cases, build checklist | ✅ Complete |
| `crost_ui.jsx` | Interactive dashboard UI — all components functional, live event log, approval feed, memo feed, constitution viewer, department wizard | ✅ Complete |
| `crost_onboarding.jsx` | Interactive onboarding flow — all 5 screens functional, conversational reflection, business interpretation, live activation animation | ✅ Complete |
| `onyx-client-spec.md` | Complete spec for `frontend/lib/onyx-client.ts` — all 15 sections, fully typed, zero ambiguity | ✅ Complete |
| `department-lifecycle-spec.md` | Complete spec for `frontend/lib/department-lifecycle.ts` — all 14 sections, typed result pattern, all lifecycle functions | ✅ Complete |

### Artefacts Referenced But Not Yet Written
| Artefact | Description | Priority |
|---|---|---|
| `scripts/seed-departments.ts` | Seeds 5 default departments into Supabase + creates Onyx personas | High |
| `scripts/health-check.ts` | Validates all services before each build phase | High |
| `supabase/functions/expire-approvals/` | Edge function — runs hourly, expires stale approvals | High |
| `supabase/functions/department-health-check/` | Edge function — runs every 15 min, repairs orphaned departments | High |
| Department Detail page UI | Per-department chat interface, task history, settings | Medium |
| Settings page UI | API keys, model config, constitution editor, tone identity | Medium |
| Empty/error states | Dashboard empty states, error banners, offline indicators | Low |

---

## 14. Build Checklist Status

### Phase 1: Infrastructure
- [ ] Clone Onyx as git submodule
- [ ] Create `.env` from `.env.example`
- [ ] Start Docker Compose (lite profile)
- [ ] Pull Ollama models: `gemma3:12b` then `llama3:8b`
- [ ] Start LiteLLM proxy — verify all routes respond

### Phase 2: Database
- [ ] Run all 6 migrations in order
- [ ] Enable Realtime on departments, approval_queue, event_log
- [ ] Verify reserved slug trigger fires
- [ ] Run seed script — verify 5 departments, all active
- [ ] Verify system_config seeded correctly

### Phase 3: Onyx Integration
- [ ] Create Onyx Personas for 5 seeded departments
- [ ] Link Persona IDs back to departments.onyx_persona_id
- [ ] Connect GitHub and Gmail connectors
- [ ] Create company_memos corpus
- [ ] Test createOnyxPersona() and deactivateOnyxPersona()

### Phase 4: Department Lifecycle API
- [ ] Build POST /api/departments (full 6-step flow)
- [ ] Build GET /api/departments
- [ ] Build PATCH /api/departments/[slug] with stage reset logic
- [ ] Build DELETE /api/departments/[slug] — soft + hard paths
- [ ] Build POST /api/departments/[slug]/activate
- [ ] Build all /api/approvals routes including execute flow
- [ ] Build all /api/memos routes including Onyx indexing
- [ ] Build /api/toggle with Realtime broadcast

### Phase 5: Frontend
- [ ] Build onboarding flow (/onboarding)
- [ ] Scaffold Next.js 14 with Tailwind + shadcn/ui + Zustand
- [ ] Build ModeToggle with Realtime subscription
- [ ] Build DepartmentCard and DepartmentGrid (fully dynamic)
- [ ] Build CreateDepartmentWizard (4-step)
- [ ] Build ActivationBadge component
- [ ] Build /dashboard page
- [ ] Build ApprovalFeedItem and /dashboard/approvals
- [ ] Build MemoCard and /dashboard/memos
- [ ] Build /dashboard/settings

### Phase 6: Dynamic Department Smoke Tests
- [ ] Create a 6th department via wizard — verify DRAFT card appears
- [ ] Promote draft → review → active — verify badge changes
- [ ] Assign task — verify Constitution is prepended, correct model used
- [ ] Trigger approval from new department — verify Approval Feed
- [ ] Rename department — verify approvals and memos stay linked
- [ ] Deprecate department — verify pending approvals auto-rejected
- [ ] Hard-delete deprecated department — verify clean removal

---

## 15. Open Questions & Future Decisions

| Question | Context | Recommendation |
|---|---|---|
| Managed Cloud vs BYOK | Should Crost proxy API calls and charge a fee? | BYOK for MVP. Managed Cloud = Phase 2. |
| Department count limit | Should there be a max number of departments? | No hard limit in MVP. UI collapses deprecated. Revisit at scale. |
| Crost Registry | Community template marketplace for department configs | Design the export format now. Launch marketplace in Phase 2. |
| Multi-founder / team access | Multiple users sharing one Crost instance | Out of scope for MVP. Single-founder model only. |
| Mobile experience | Current UI is desktop-first | Responsive breakpoints in the spec but not designed in detail. |
| Billing integration | Stripe for Managed Cloud tier | Phase 2 only. |

---

## 16. Glossary

| Term | Definition |
|---|---|
| **Department** | An AI agent configured with a persona, toolset, and task queue. The core unit of Crost. |
| **Persona Prompt** | The department-specific system prompt defining its role, responsibilities, and rules. |
| **Constitution** | Non-overridable safety rules prepended to every department's prompt. |
| **Local Identity** | Founder-configured tone and cultural context injected globally across all prompts. |
| **Activation Stage** | The deployment lifecycle state of a department: draft → review → active → paused → deprecated. |
| **Approval Feed** | The queue of pending high-stakes actions waiting for the founder's sign-off. |
| **Company Memos** | The shared knowledge base that agents write to and read from. Indexed in Onyx's vector store. |
| **Memo Brief** | A formatted summary of recent high-priority memos injected into an agent's prompt before it starts a task. |
| **HITL** | Human-in-the-Loop. The pattern where agents pause and request founder approval before irreversible actions. |
| **Onyx** | The open-source RAG and agent engine (formerly Danswer) that Crost is built on top of. |
| **LiteLLM** | The model routing proxy that sits between Onyx and the actual LLMs (local or cloud). |
| **Ollama** | The local LLM runtime. Runs models like Gemma 3 and Llama 3 on the founder's machine. |
| **BYOK** | Bring Your Own Key. Founders provide their own API keys for cloud LLMs. |
| **ENV_MODE** | The current mode: `local` (Ollama) or `cloud` (Gemini/Claude/Groq). Stored in system_config. |
| **Sync Failed** | The sentinel value `'SYNC_FAILED'` stored in `departments.onyx_persona_id` when Onyx persona creation failed. Retried automatically every 15 minutes. |
| **Lifecycle Result** | The typed return pattern `{ success: true, data } \| { success: false, error, code }` used by all department lifecycle functions. Never throws. |

---

*This document represents the complete state of the Crost project as of April 2026. All artefacts listed in Section 13 are available separately. The build is in progress — Claude Code has been given the v3 spec, both UI files, and the onyx-client and department-lifecycle specs.*
