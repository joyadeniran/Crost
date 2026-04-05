# Crost — Master Context Document
**Version:** MVP Redline (Tactical Hub)
**Last updated:** April 2026
**Purpose:** Complete context for any AI builder continuing this project. Read this first, in full, before touching any code.

---

## 1. What Crost Is

Crost is an **Agentic Operating System for solo founders**. Not a chatbot. Not an AI wrapper. A structured Agent Office where each "Department" is a semi-autonomous AI agent with its own persona, toolset, and task queue.

**The core loop:**
1. Founder types a goal into the War Room command bar
2. The Orchestrator agent decomposes it into a structured JSON plan
3. The founder reviews, approves/modifies/rejects each task individually
4. Approved tasks are dispatched to worker departments simultaneously
5. Workers execute, write results to memos, log everything to event_log
6. The activity feed shows the company working in real time

**The one differentiator that cannot be compromised:**
The online/local toggle — "Private Delegation." The Orchestrator can run on Gemini (cloud, complex planning) while a Sales worker queries the founder's local database on Ollama (private, never leaves the machine). No competitor offers this split. This is the moat.

---

## 2. The MVP Scope — Exactly This, Nothing More

### In scope
- Constitution + prompt assembly order (safety structurally enforced)
- Approval feed with risk levels + reasoning field
- Department lifecycle: draft → review → active
- Memo / activity feed as audit trail (event_log rendered as timeline)
- Online/local toggle (per-department model assignment)
- Onboarding with local identity (injected before any agent runs)
- **1 Orchestrator persona** outputting JSON plans
- **3 worker departments:** Sales, Marketing, Ops
- **3 hardcoded tools:** Supabase query, Gmail/WhatsApp draft, web search
- BYOK for all cloud LLMs

### Out of scope (do not build)
- Mobile app / Dispatch
- Voice / walkie-talkie
- More than 3 tools
- Managed billing / Stripe
- More than 3 worker departments for MVP
- Prompt injection defence (Phase 2)
- Rollback mechanism (Phase 3, before public launch)
- Tool scoping / capability constraints (Phase 2)

### The one-line test
"Does this help one founder complete one real business task safely — or does it help an imagined founder use an imagined complete product?" If the second: cut it.

---

## 3. Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Agent Engine | Onyx (forked) | RAG, connectors, tool-calling |
| LLM Router | LiteLLM (via Onyx) | Routes to local or cloud |
| Local LLM | Ollama — gemma3:12b default | Also pull llama3:8b |
| Cloud LLM Primary | Google Gemini 1.5 Pro | cloud/gemini-pro |
| Cloud LLM Alt | Anthropic Claude 3.5 Sonnet | cloud/claude-sonnet |
| Frontend | Next.js 14 App Router + Tailwind | TypeScript strictly |
| UI Components | shadcn/ui | Pre-configured |
| State | Zustand | Lightweight global state |
| Database | Supabase (Postgres) | Auth + DB + Realtime |
| Vector Store | Vespa (via Onyx) | RAG and memo indexing |
| Background Jobs | Supabase Edge Functions | Approval expiry, health check |
| Containerisation | Docker + Docker Compose | onyx-lite profile for dev |
| Package Manager | pnpm | |
| Type Safety | Zod | All API input/output validation |

---

## 4. The Prompt Assembly Order — Non-Negotiable

Every agent (orchestrator and workers) receives prompts assembled in this exact order:

```
1. Crost Constitution (non-overridable safety rules)
2. Department Persona Prompt (role, responsibilities, rules)
3. Local Identity (tone and cultural context — injected HERE, not at the end)
4. Capability Boundaries (what this dept can/cannot do)
5. Memo Brief (recent high-priority company memos the dept hasn't read)
6. Task (the instruction)
```

**Critical:** Local identity is injected at position 3, not as a post-processing step. It affects how the orchestrator frames tasks and how workers produce outputs.

---

## 5. The Crost Constitution

### Full constitution (8 clauses — all agents)
1. NEVER take an irreversible action without calling `request_approval()` first.
2. NEVER fabricate data, metrics, quotes, or facts.
3. NEVER expose credentials, API keys, personal data, or financial figures.
4. NEVER make commitments on behalf of the founder without explicit approval.
5. ALWAYS check company_memos before starting a task.
6. ALWAYS surface uncertainty rather than guessing.
7. ALWAYS log task start, completion, and errors.
8. You are a department head. The founder is the CEO.

### Worker MVP constitution (3 clauses — workers only, minimum viable)
1. NEVER take an irreversible action without calling `request_approval()` first.
2. NEVER fabricate data, metrics, quotes, or facts.
3. You are executing a specific task assigned by the orchestrator. Do not deviate from the assigned task parameters.

### 9th clause — Orchestrator only
Before decomposing any goal, write a one-sentence risk assessment visible to the founder in the plan. If you cannot assess the risk confidently, say so explicitly. You are the highest-privilege agent in the system. The blast radius of your errors is company-wide.

---

## 6. The Orchestrator

### What it is
A dedicated Onyx persona that sits above the 3 worker departments. Its job is NOT to execute tasks — it decomposes goals, queries departments for context data, drafts a structured JSON plan, and reports back to the founder.

### Critical constraint
The orchestrator outputs **structured JSON only**. Never prose. The UI renders the JSON, the approval feed parses it, the workers consume typed task objects. An orchestrator that returns prose is a demo. One that returns JSON is a product.

### Orchestrator JSON output schema
```json
{
  "goal": "string — the founder's original input",
  "risk_note": "string — one sentence, mandatory, no exceptions",
  "tasks": [
    {
      "id": "string — uuid",
      "dept": "sales | marketing | ops",
      "action": "string — snake_case action name",
      "label": "string — human-readable, shown in approval feed",
      "reasoning": "string — why this task serves the goal",
      "params": {},
      "risk_level": "low | medium | high | critical",
      "model": "local/* | cloud/* — which model this task should use",
      "depends_on": ["task_id"] 
    }
  ]
}
```

### The query-first protocol
The orchestrator MUST query departments before drafting a plan. It cannot plan from assumptions. For "double sales in December," it must first query: Sales (current conversion rates), Finance (current margins), Ops (inventory capacity). Only then does it generate the plan.

### The flow
```
Founder input
→ Orchestrator queries departments (read-only, no approvals needed)
→ Orchestrator drafts JSON plan + risk_note
→ Plan shown to founder in War Room
→ Founder reviews each task: Approve / Modify / Reject
→ Fan-out: approved tasks dispatched as typed task objects to workers
→ Workers execute independently
→ Orchestrator aggregates results
→ Report back to founder via memo + activity feed
```

**Fan-out only happens after selective plan approval.** The founder can greenlight Marketing and hold Sales. The system waits. This is the HITL gate applied at goal level.

---

## 7. The 3 Worker Departments

Workers are "dumb" in the sense that they don't strategise — they receive a typed task object and execute it. But they are NOT dumb on safety. Every worker has the 3-clause MVP constitution.

### Typed task object (what workers receive)
```typescript
interface WorkerTask {
  id: string
  action: string
  label: string
  reasoning: string
  params: Record<string, unknown>
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  model: string
}
```

### Sales department
- **Tool:** Supabase query (read-only)
- **Actions:** filter_retailers, get_conversion_rates, get_dormant_leads, get_pipeline_summary
- **Model:** local/* by default (data stays private)
- **Cannot:** write to database, send messages, make external API calls

### Marketing department
- **Tool:** Gmail/WhatsApp draft (draft only — never send without approval)
- **Actions:** draft_whatsapp_templates, draft_email_campaign, draft_social_post
- **Model:** cloud/* by default (better creative output)
- **Cannot:** send messages, post publicly, access customer data directly

### Ops department
- **Tool:** Supabase query (read-only) + web search
- **Actions:** check_inventory, check_credit_limits, get_supplier_status, search_market_data
- **Model:** local/* by default
- **Cannot:** modify inventory, change credit limits, make purchases

---

## 8. The Approval Feed Protocol

### REQUEST_APPROVAL signal
When any agent needs approval, it includes this exact string in its response:
```
REQUEST_APPROVAL: {"action_type": "...", "action_label": "...", "reasoning": "...", "payload": {...}, "context": "..."}
```

The `reasoning` field is **mandatory**. A missing reasoning field must be treated as a malformed approval request and rejected automatically.

### Risk levels by action type
| Action | Risk Level |
|--------|-----------|
| run_query, create_document, file_reader | low |
| post_social, send_message, external_api_call | medium |
| send_email, merge_code | high |
| spend_budget, delete_data | critical |

### Orchestrator plan approval
Plans from the orchestrator create a special approval type: `orchestrator_plan`. This is always treated as `critical` risk regardless of the individual task risk levels within it.

Each task in the plan is individually approvable. The UI must support:
- Approve All (shortcut, not default)
- Per-task: Approve / Modify / Reject
- Hold (approve later, don't block other tasks)

---

## 9. Database Schema

### Migration order (must run in sequence)
1. departments table
2. approval_queue table
3. company_memos table
4. event_log table
5. system_config table
6. available_tools table

### Key fields

**departments**
- `activation_stage` — draft | review | active | paused | deprecated
- `status` — idle | running | awaiting_approval | error | paused
- `onyx_persona_id` — NULL = not created. 'SYNC_FAILED' = retry pending
- `capabilities`, `restrictions` — JSONB arrays
- `is_orchestrator` — boolean, only one row can be true
- Reserved slugs blocked by trigger: system, admin, api, memos, approvals, settings, onboarding, health, toggle, status, dashboard, departments, activate, deprecate

**approval_queue**
- Types for MVP: task_approval, orchestrator_plan, orchestrator_conflict
- `reasoning` — text, NOT NULL (mandatory field)
- `expires_at` — defaults 24 hours
- `department_name`, `department_slug` — denormalised, trigger keeps in sync

**company_memos**
- `source_type` — "founder" | "agent" | "orchestrator" | "external"
- `read_by` — array of department slugs
- `onyx_index_id` — NULL if Vespa indexing failed

**event_log**
- Immutable. Never delete rows.
- Key types: task_started, task_completed, approval_requested, approval_granted, approval_rejected, department_created, department_activated, token_limit_hit, mode_switched, goal_received, plan_drafted, plan_approved

**system_config — key rows**
- `env_mode` — "local" | "cloud"
- `agent_constitution` — full text, is_founder_editable = false for core clauses
- `local_identity` — set at onboarding, injected into every prompt
- `token_hard_limit_per_session` — default 50000
- `orchestrator_persona_id` — Onyx persona ID for the orchestrator
- `orchestrator_risk_tolerance` — maps to approval thresholds

**available_tools (MVP — 3 only)**
- supabase_query
- gmail_draft (also covers WhatsApp draft)
- web_search

### New tables for orchestrator
```sql
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  founder_input TEXT NOT NULL,
  orchestrator_plan JSONB,
  risk_note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','planning','awaiting_approval','executing','completed','failed')),
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 10. The Onboarding Flow

**Hard gate:** `local_identity` must be set before any agent runs. The dashboard does not load until onboarding is complete.

### 4 screens + activation moment

**Screen 0 — System Check (~10 seconds)**
Scans for Ollama, RAM, internet, GPU. Amber warnings don't block. Missing Ollama: show install link + "Continue with Cloud Mode" option.

**Screen 1 — Identity (~90 seconds)**
Three conversational questions asked one at a time, each reflected back:
1. Name + city/country → "Hey Joy. Building in Lagos — got it."
2. Business description → Crost interprets: "B2B credit infrastructure for informal retail. Noted."
3. Stage: Idea / MVP / Early Traction / Scaling

**Screen 2 — Control Style (~15 seconds)**
- Careful — ask before most actions
- Balanced — standard approvals on high-stakes only (default)
- Aggressive — move fast, fewer interruptions
Sets `risk_tolerance` in system_config.

**Screen 3 — Pick Your Team (~30 seconds)**
Show 3 department cards (Sales, Marketing, Ops). Founder picks which to activate first.

**Activation Moment**
Selected departments show live progress. Once ready: goal input appears. Founder types first goal. Dashboard opens with departments already working.

### What to cut from onboarding for MVP
- API Key Vault → Settings
- Full Constitution reading → Settings
- Tool connection → contextual, first time agent needs it
- Billing → after first value moment

---

## 11. Key Files Already Specified

These artefacts exist and should be treated as ground truth:

| File | Status | Description |
|------|--------|-------------|
| `crost_mvp_spec_v3.md` | Complete | Full MVP technical spec |
| `crost_ui.jsx` | Complete | Interactive dashboard UI |
| `crost_onboarding.jsx` | Complete | Onboarding flow |
| `onyx-client-spec.md` | Complete | All 15 sections, fully typed |
| `department-lifecycle-spec.md` | Complete | All 14 sections, typed result pattern |

---

## 12. Critical Implementation Rules

### onyx-client.ts
- Server-side only — never import from a client component
- `runDepartmentTask()` is the only function that writes to `departments.status`
- `buildFinalPrompt()` always fetches fresh config — never cache its result
- `resolveActiveModel()` reads `env_mode` on every call — no caching
- `logEvent()` never throws, always safe to call

### department-lifecycle.ts
- Every function returns `LifecycleResult<T>` — never throws to the caller
- API routes are thin wrappers — all logic lives in lifecycle functions

### API response shape
```typescript
type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
  code?: string
  warning?: string
  timestamp: string
}
```

### UI rules
- No component may hardcode a department name, slug, count, or icon
- Grid and all feeds render dynamically from the departments table
- PulseIndicator uses CSS animation only — no JS intervals
- Running = green pulse, Awaiting Approval = amber pulse (faster)

---

## 13. The Hybrid Engine — Private Delegation

This is the competitive moat. Implement it exactly as described.

Per-department model assignment:
- Orchestrator: cloud/* (Gemini for complex planning)
- Sales: local/* (retailer data stays on machine)
- Marketing: cloud/* (better creative output)
- Ops: local/* (business data stays on machine)

`resolveActiveModel()` in onyx-client.ts handles mode switching. If env_mode is local but a department has cloud/* model: map to local equivalent automatically. No manual config required on switch.

Token limit enforcement:
- At 80%: yellow banner
- At 100%: auto-switch to local, red banner, log `token_limit_hit`
- Already in local at limit: tasks paused, modal requires acknowledgment

---

## 14. What "Done" Looks Like for MVP

The MVP is complete when a founder can:
1. Complete onboarding (local identity set, 3 departments activated)
2. Type "Prepare for December sales push" in the War Room
3. See a structured JSON plan with risk note appear
4. Approve Marketing, hold Sales, reject Ops
5. See Marketing draft 3 WhatsApp templates
6. See the activity feed update in real time
7. Find the drafts in company_memos
8. Toggle to local mode and repeat — no data leaves the machine

That is the loop. Everything else is v1.1.
