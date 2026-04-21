# Crost MVP Intelligence Architecture (Onyx-Inspired, Lean Implementation)

## Core Principle

We are **not building an agent framework**.

We are building:

> **A structured decision and execution system that turns goals into coordinated company action.**

We borrow ideas from advanced systems (like Onyx), but implement them in the simplest possible way.

---

# System Overview

```
Founder → Orc (Dialogue + Planning)
        → Plan (structured tasks)
        → Approval Layer
        → Workers (execute with context)
        → Memos (shared memory)
        → Orc (synthesis report)
        → Founder (next decision)
```

---

# 1. Orchestrator (Orc) Responsibilities

## Orc has 3 modes:

### 1. Dialogue Mode

Used when the goal is ambiguous.

```json
{
  "mode": "clarify",
  "message": "Before I plan this — what's the priority? Revenue, retention, or product?",
  "options": ["Revenue", "Retention", "Product", "Other"]
}
```

---

### 2. Planning Mode

Used when enough context is available.

```json
{
  "mode": "plan",
  "goal": "...",
  "risk_note": "...",
  "tasks": [
    {
      "dept": "sales",
      "label": "...",
      "reasoning": "...",
      "risk_level": "medium",
      "params": {
        "goal_context": "...",
        "data_available": "...",
        "deliverable": "..."
      }
    }
  ]
}
```

---

### 3. Report Mode (Final Synthesis)

Outputs plain language:

* What happened
* What it means
* What to do next

---

# 2. Worker Design (No “Agents”)

Workers are **functions with structured prompts**, not autonomous agents.

---

## Worker Rules

Every worker must:

1. Use available context (no guessing)
2. Return structured output (strict JSON)
3. Declare uncertainty when needed
4. Reference other departments’ work

---

## Worker Input

```json
{
  "goal_context": "...",
  "company_context": "...",
  "existing_memos": [],
  "task": "...",
  "deliverable": "...",
  "constraints": "...",
  "expected_output_format": "STRICT JSON"
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

## Critical Rule

> ❌ Never generate from scratch
> ✅ Always reason from context

---

# 3. “Needs More Data” Mechanism

Workers must be allowed to say:

```json
{
  "needs_more_data": true,
  "missing_data": ["sales data last 30 days"]
}
```

---

## Why this matters

* Prevents hallucination
* Improves orchestration quality
* Builds founder trust

---

# 4. Shared Memory (Memos System)

Use a single table: `company_memos`

---

## Required Fields

* `goal_id`
* `department`
* `content`
* `confidence`
* `created_at`

---

## Retrieval Function

```ts
getMemos({
  goalId,
  lastN: 10
})
```

---

## Rules

* Always pass recent memos into:

  * Orc (planning)
  * Workers (execution)

---

# 5. Context Injection (MANDATORY)

Before any worker runs:

```ts
const memos = await getMemos(goalId);
```

Then inject:

```json
{
  "existing_context": memos,
  "do_not_guess": true
}
```

---

# 6. Tool Thinking (Lightweight Version)

Workers should think in terms of tools—even if mocked.

---

## Example

```json
{
  "tool": "get_sales_data",
  "params": { "range": "30d" }
}
```

---

## Implementation

* Stub tool responses for now
* Replace with real integrations later

---

# 7. Multi-Step Reasoning (Prompt Embedded)

Every worker should follow:

```
1. Understand goal
2. Check existing context
3. Identify gaps
4. Produce structured output
```

---

# 8. Observability (Non-Negotiable)

Everything must be visible:

* Tasks created
* Tasks approved
* Worker outputs
* Orc decisions

---

## Activity Feed = Debugger

This is how you:

* debug system behavior
* build trust with founders

---

# 9. What We Are NOT Implementing

## Do NOT build:

* Multi-agent orchestration frameworks
* Vector databases (yet)
* Autonomous loops
* Complex trust hierarchies
* External agent platforms (e.g. Onyx runtime)

---

# 10. Trust Model (Simplified)

## Do NOT restrict memo access.

Instead:

* Add `confidence` to every output
* Let Orc decide what to trust

---

## Example

```json
{
  "confidence": 0.72,
  "based_on": ["historical campaign data"]
}
```

---

# 11. System Priorities (Execution Order)

## Phase 1

* Dynamic departments
* Context injection

## Phase 2

* Worker structured outputs
* Needs-more-data handling

## Phase 3

* Task modification UI
* Improved worker prompts

## Phase 4

* Orc synthesis report

## Phase 5

* Dialogue mode

---

# 12. Core Product Loop

This is the ONLY thing that matters:

```
Goal → Plan → Approve → Execute → Report
```

If this loop works:
→ You have a product

If it doesn’t:
→ Nothing else matters

---

# 13. Final Principle

We are not building “AI agents”.

We are building:

> **A system that allows founders to delegate thinking and execution safely.**

---

# 14. MVP Success Criteria

A founder should be able to:

1. State a goal
2. See a structured plan
3. Approve it
4. Watch execution happen
5. Receive a clear summary

And say:

> “This feels like a real team.”

---

# End
