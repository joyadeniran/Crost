CROST SPEC — (v1.0)

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

Users can provide:

Gemini
Claude
Groq
Behavior
Default model selected by user
Routing happens automatically
🔐 10. Human-in-the-Loop (HITL)
Absolute Rule

NOTHING executes without founder approval

Flow
Goal → Orc Strategy → Founder Approval → Execution
Risk Mode
Configurable setting:
Conservative (strict approval)
Aggressive (auto-execution allowed)
🌐 11. Onboarding Intelligence
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
💬 12. Interaction Modes
Mode 1 — Orc Chat
Strategy
Planning
Coordination
Mode 2 — Department Chat
Direct execution tasks
Writes to Memo
👁 13. Visibility
Users See
Strategy (friendly)
Task list (status only)
Artefacts
Clean Memo view
Users Do NOT See
Internal logs
Raw model routing
Low-level execution noise
🔮 14. FUTURE FEATURES (DO NOT BUILD NOW)

⚠️ These are strictly not MVP features, but system must be designed to support them.

14.1 Marketplace
Custom departments
Prompt packs
Tool integrations
14.2 Autonomous Mode
Full execution without approval
Scheduled operations
14.3 Advanced Tooling (Onyx-like)
Connectors (Slack, GitHub, Gmail)
Sandbox execution
14.4 Local Mode
Ollama integration
Private data processing
14.5 Advanced Model Assignment UI
Per-department models
Per-task overrides
🚫 15. Explicit Non-Goals (MVP)

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