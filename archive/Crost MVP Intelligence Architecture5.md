
---

# Crost MVP Intelligence Architecture v5.0

### *(Cloud-Native, Build-Ready, Founder-Controlled)*

---

# 1. Core Principle

We are **not building agents**.

We are building:

> **A structured system that turns goals into coordinated company execution.**

---

## Product Definition

Crost is:

> **An action-oriented office where founders state goals and receive coordinated execution across departments—with full control.**

---

## Non-Negotiable Loop

```
Goal → Plan → Approve → Execute → Report
```

If this loop works → you have a product
If it doesn’t → nothing else matters

---

# 2. System Architecture (Simplified)

```
Founder
   ↓
[ Orc (Planning + Control) ]
   ↓
Plan (JSON tasks)
   ↓
Approval Layer (Supabase)
   ↓
Execution Engine (Edge Function / Inngest)
   ↓
Workers (LLM calls)
   ↓
Memos (shared memory)
   ↓
[ Orc (Synthesis) ]
   ↓
Final Report
```

---

# 3. Tech Stack (Cloud-Native)

## Core

* **Frontend:** Next.js (deploy on Vercel)
* **Backend / State:** Supabase (Postgres + Realtime)
* **LLMs:**

  * Strong model → planning + synthesis
  * Fast model → execution
* **Background Jobs:**

  * Start: Supabase Edge Functions
  * Scale: Inngest (later)

---

## Model Strategy (IMPORTANT)

Do NOT hardcode providers.

### Use a model router:

```ts
getModel(taskType)
```

---

### Suggested Mapping

```ts
planning     → strong model
execution    → fast model
analysis     → strong model
summarization→ fast model
```

---

### Example (initial setup)

```ts
const MODELS = {
  planning: "strong-model",
  execution: "fast-model"
};
```

---

# 4. Orc (Orchestrator)

## Orc is NOT a chatbot

It is:

> **A decision engine that plans, evaluates, and synthesizes company activity**

---

## Orc Modes

### 1. Dialogue Mode (clarification)

```json
{
  "mode": "clarify",
  "message": "What’s the priority for this goal?",
  "options": ["Revenue", "Retention", "Product"]
}
```

---

### 2. Planning Mode

Outputs structured plan:

```json
{
  "goal_id": "dec-sales",
  "plan": [
    {
      "task_id": "t1",
      "dept": "marketing",
      "action": "draft_campaign",
      "risk": "low",
      "requires_approval": true
    }
  ]
}
```

---

### 3. Report Mode (Synthesis)

Outputs:

* What happened
* Key insights
* Risks
* Recommended next actions

---

## Critical Rule

> Orc must THINK, not just route tasks.

It should:

* interpret memos
* detect conflicts
* request clarification
* prioritize execution

---

# 5. Workers (Execution Layer)

## Workers are NOT agents

They are:

> **Structured LLM functions with strict input/output contracts**

---

## Worker Input

```json
{
  "goal_context": "...",
  "company_context": "...",
  "task": "...",
  "existing_memos": [],
  "constraints": "...",
  "expected_output": "STRICT JSON"
}
```

---

## Worker Output

```json
{
  "summary": "...",
  "insights": [],
  "risks": [],
  "confidence": 0.0,
  "needs_more_data": false,
  "missing_data": [],
  "next_actions": []
}
```

---

## Worker Rules

1. Must use provided context
2. Must NOT guess
3. Must declare uncertainty
4. Must return structured output

---

# 6. “Needs More Data” Mechanism

Workers can pause execution:

```json
{
  "needs_more_data": true,
  "missing_data": ["last 30 days sales"]
}
```

---

## System Behavior

* Task pauses
* Founder is notified
* Orc may re-plan

---

# 7. Shared Memory (Memos System)

## Table: `memos`

Fields:

* `id`
* `goal_id`
* `task_id`
* `department`
* `content`
* `confidence`
* `created_at`

---

## Retrieval

```ts
getMemos(goalId, lastN = 10)
```

---

## Rules

* Always inject memos into:

  * Orc planning
  * Worker execution

---

# 8. Context System (“Shadow RAG”)

No embeddings (for now).

---

## Instead:

### Context Sources:

* Constitution (global rules)
* Context files (uploaded docs)
* Recent memos

---

## Prompt Assembly

```ts
context = [
  constitution,
  context_files,
  recent_memos
]
```

---

## Principle

> Inject context directly → avoid complex retrieval systems

---

# 9. Execution Engine

## Trigger Flow

```
Task Approved → Execution Trigger → Worker Runs → Memo Saved
```

---

## Implementation Options

### MVP:

* Supabase Edge Function
* Triggered by DB change (`is_approved = true`)

---

### Later:

* Inngest (for retries, scheduling, scaling)

---

# 10. Execution State Machine (CRITICAL)

You MUST track task states:

```ts
status:
- pending
- planned
- approved
- running
- completed
- failed
- needs_data
```

---

## Why this matters

Prevents:

* duplicate execution
* stuck flows
* inconsistent behavior

---

# 11. Approval System

## Rule:

> Nothing executes without founder approval

---

## Task Fields

```ts
requires_approval: true
is_approved: false
```

---

## Execution Gate

Worker runs ONLY if:

```ts
is_approved === true
```

---

# 12. Activity Feed (Heartbeat)

## This is NOT just UI

It is:

> **the system debugger + trust engine**

---

## Events to show:

* Goal created
* Plan generated
* Task approved
* Worker running
* Memo created
* Task completed

---

## Implementation

* Supabase Realtime
* Append-only event log

---

# 13. Observability

Track everything:

* Orc decisions
* Worker outputs
* Failures
* retries

---

## Rule

> If you can’t see it, you can’t debug it.

---

# 14. Security (Crost Constitution)

## Global system instruction

Injected into EVERY prompt:

* no unauthorized actions
* respect approval gating
* do not hallucinate

---

## Tool Access Rule

External actions (future):

* email
* whatsapp
* db writes

Require:

```ts
is_approved === true
```

---

# 15. What We Are NOT Building (MVP)

❌ No Onyx
❌ No vector DB
❌ No multi-agent frameworks
❌ No autonomous loops
❌ No agent-to-agent communication

---

# 16. Build Order (Ship Fast)

## Phase 1 (Foundation)

* Supabase tables:

  * goals
  * tasks
  * memos
* Basic UI

---

## Phase 2 (Planning)

* Orc API (plan generation)
* Save tasks to DB

---

## Phase 3 (Execution)

* Approval toggle
* Edge function trigger
* Worker execution

---

## Phase 4 (Visibility)

* Activity feed
* Task states

---

## Phase 5 (Intelligence)

* Orc synthesis report
* Dialogue mode

---

# 17. MVP Success Criteria

A founder can:

1. State a goal
2. See a structured plan
3. Approve tasks
4. Watch execution live
5. Receive a clear report

And say:

> “This feels like a real team.”

---

# 18. Final Principle

We are not building AI tools.

We are building:

> **A system that lets founders delegate thinking and execution—safely, visibly, and reliably.**

---
