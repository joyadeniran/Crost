CROST SPEC — (v1.2)

> This is the source of truth for Crost architecture.
> Do not modify without founder approval.

🧠 0. Core Philosophy

Crost is not a chatbot.

Crost is a Human-in-the-loop Company Operating System
where AI simulates departments, coordinated by a central Chief of Staff (Orc), to help a founder run a company.

🏛 1. System Overview
Key Components
Founder (Human)
    ↓
Orc (Chief of Staff / Strategist)
    ↓
Execution Engine (Routing System)
    ↓
Departments (Marketing, Sales, Engineering, Ops)
    ↓
Outputs (Memo + Artefacts)
🧠 2. Orc (Chief of Staff)
Responsibilities
Understand founder goals
Generate strategy (best-effort first)
Break into actionable work
Coordinate departments
Ask questions ONLY when necessary
Synthesize outputs into final reports
Behavior Rules

Orc must:

Attempt strategy before asking questions
Ask only when:
Critical business info is missing
Decision is irreversible
Multiple valid paths exist
Maintain friendly, conversational tone
Always respect HITL (no execution without approval)
👥 3. Departments

Departments are NOT independent agents.

Definition:
Department = {
  name: string
  systemPrompt: string
  tools: string[]
  taskTypes: string[]
}
Behavior
Can be chatted with directly by user
Operate independently BUT:
Read from Memo
Write to Memo
Can produce artefacts
Do NOT override Orc decisions
Future-Ready
Departments can be:
Added
Removed
Marketplace-driven (NOT MVP)
⚙️ 4. Execution Engine (Core System)
Definition

A stateless orchestration layer that:

Reads Memo
Receives tasks from Orc
Routes tasks to models
Executes tasks
Writes outputs back to system
Components
Execution Engine =
- Context Builder
- Model Router
- Task Runner
- State Writer
🧾 5. Company Memo (CRITICAL)
Definition

The Memo is the single source of truth for the company state.

Storage
PostgreSQL (Supabase)
Structured + append-only logs
Structure
CompanyMemo = {
  company_profile: {
    name,
    industry,
    location,
    description
  },
  active_goals: [],
  strategies: [],
  task_logs: [],
  artefact_references: [],
  decisions: [],
  department_notes: {}
}
Rules
Every task MUST read from Memo
Every task MUST write to Memo
Orc re-reads Memo before every decision
📦 6. Artefacts System
Storage Strategy
Files stored in:
Supabase Storage (or S3)
DB stores metadata only
Artefact Table
Artefact = {
  id,
  type: "doc" | "excel" | "image",
  file_url,
  task_id,
  created_by,
  created_at,
  metadata
}
Rules
Long outputs → Artefact
Downloadable content → Artefact
Memo stores only references
MVP Supported Types
Documents
Excel/CSV
Images
🧠 7. Task System
Task Object
Task = {
  id: string
  title: string
  department: string
  type: "planning" | "execution" | "analysis"
  status: "pending" | "running" | "done" | "failed"
  dependencies: string[]
  input_context: object
  output: object | null
  artefact_ids: string[]
}
Execution Rules
Tasks can run in parallel
Dependencies respected when required
Failure:
No auto-retry (MVP)
Escalate to Orc
🧠 8. Planning System (Hybrid)
Rule
If goal is complex → Orc generates plan
If goal is simple → Orc executes directly
Plan Visibility
Founder sees:
Friendly strategy (natural language)
System uses:
Structured task list
🧠 9. Model Routing (Multi-Model System)
Tiers
Tier	Use Case
Tier 1	Strategy, reasoning
Tier 2	Execution
Tier 3	Formatting
Routing Logic
function selectModel(task) {
  if (task.type === "planning") return HIGH_REASONING_MODEL
  if (task.type === "execution") return FAST_MODEL
  if (task.type === "formatting") return ULTRA_FAST_MODEL
}
BYOK (Bring Your Own Key)

Users can provide keys for the following canonical providers:

| Provider  | Slug        | LiteLLM Prefix  |
|-----------|-------------|-----------------|
| Google    | `gemini`    | `gemini/`       |
| Anthropic | `anthropic` | `anthropic/`    |
| Groq      | `groq`      | `groq/`         |
| OpenAI    | `openai`    | `openai/`       |

**Rules:**
- Provider slugs `'claude'` and `'google'` are deprecated. Use `'anthropic'` and `'gemini'`.
- OpenAI excluded from MVP implementation; included in canonical list for future readiness.

Key Resolver Behavior

Exactly ONE key per LLM request — never merge keys:

```
if (isBootstrap)           → system key (always)
if (no userId)             → system key
if (user has valid BYOK)   → user key
else                       → system key fallback
```

- User keys passed via `body.api_key` to LiteLLM (key-passthrough mode). Never `extra_body.api_key`.
- System key: `LITELLM_MASTER_KEY` in Authorization header.
- LiteLLM virtual key management: NOT used. Key passthrough mode only.

Bootstrap Calls

Bootstrap = onboarding inference ONLY. Includes:
- Company profiling
- Competitor inference
- Initial strategy suggestion

Does NOT include: first goal execution, background tasks.

Bootstrap calls always use the system key and are exempt from usage limits.
🔑 10. Free Tier & Usage Limits

**System Key Quota**
- Per user, per day: `FREE_SYSTEM_DAILY_TOKENS` tokens (default: 50,000)
- Resets at midnight UTC daily
- Applies only to system-key calls; BYOK calls have no quota

**First-Goal Exemption**
- A user with zero prior system-key usage bypasses the daily limit
- Exemption is one-time; subsequent goals apply the standard quota

**Hard Fail on Limit Exceeded**
- Return error: `"Free usage limit reached. Please add your API key to continue or wait till your limit resets."`
- Include: `resetAt` (ISO timestamp of next midnight UTC)
- Do NOT queue requests or retry silently

**Usage Logging**
- Every LLM call writes one row to `api_usage_logs` (billing table)
- `api_usage_logs` is separate from `event_log` (system events)
- New function `logUsage()` — do NOT overload `logEvent()`
- Skip logging entirely when `userId` is null
- Cost estimated from static pricing table (no LiteLLM dependency for cost)

**UI Behaviour**
- Settings page shows real progress bar (green < 75%, amber 75–90%, red > 90%)
- Displays "Resets at [local time]"
- If user has any valid BYOK key: show "Using your API key — no system limit applies"

**Concern Separation**
- `ApiKeysSettings` → stores and validates API keys → writes to `user_api_keys`
- `ModelAssignmentForm` → assigns models to roles → writes to `user_model_assignments`
- These are separate pathways. `ModelAssignmentForm` MUST NOT store or manage API keys.

🔐 11. Human-in-the-Loop (HITL)
Absolute Rule

NOTHING executes without founder approval

Flow
Goal → Orc Strategy → Founder Approval → Execution
Risk Mode
Configurable setting:
Conservative (strict approval)
Aggressive (auto-execution allowed)
🌐 12. Onboarding Intelligence
Flow
User inputs:
Name
Company
Orc:
Runs web search (funded)
Infers:
Industry
Competitors
Positioning
Prefills:
Memo
First strategy draft
User edits/approves
💬 13. Interaction Modes
Mode 1 — Orc Chat
Strategy
Planning
Coordination
Mode 2 — Department Chat
Direct execution tasks
Writes to Memo
👁 14. Visibility
Users See
Strategy (friendly)
Task list (status only)
Artefacts
Clean Memo view
Users Do NOT See
Internal logs
Raw model routing
Low-level execution noise
🔮 15. FUTURE FEATURES (DO NOT BUILD NOW)

⚠️ These are strictly not MVP features, but system must be designed to support them.

15.1 Marketplace
Custom departments
Prompt packs
Tool integrations
15.2 Autonomous Mode
Full execution without approval
Scheduled operations
15.3 Advanced Tooling (Onyx-like)
Connectors (Slack, GitHub, Gmail)
Sandbox execution
15.4 Local Mode
Ollama integration
Private data processing
15.5 Advanced Model Assignment UI
Per-department models
Per-task overrides
15.6 OpenAI Provider
GPT-4o and GPT-4o-mini via openai/ prefix
Full parity with existing BYOK providers
🚫 16. Explicit Non-Goals (MVP)

Do NOT build:

Full RAG system
Auto-retry loops
Complex agent hierarchies
Code execution sandbox
Real-time collaboration infra
🧭 Final Note (Founder to Builder)

This system is not about automating tasks.
It is about augmenting decision-making at the company level.

Every implementation decision must preserve:

Clarity
Control
Founder trust