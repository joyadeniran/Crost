# Crost: Master Source of Truth

**Version:** 4.0 (State-Driven Execution System)
**Last Updated:** April 9, 2026
**Purpose:** The definitive technical and operational specification of Crost.

---

# 1. Core Principle

Crost is a **State-Driven Agentic Operating System**.

It does NOT run on prompts.
It runs on **structured company state (memo system)**.

---

# 2. System Architecture Overview

Crost consists of five core layers:

1. **Onboarding Layer (State Initialization)**
2. **Cognitive Layer (Orc)**
3. **Execution Layer (Task Engine)**
4. **State Layer (Memo + Tasks + Artefacts)**
5. **Storage Layer (External Object Storage)**

---

# 3. Onboarding → State Initialization (CRITICAL)

## 3.1 Company Profile

```sql
company_profile
- id
- user_id
- company_name
- industry
- location
- local_identity (jsonb)
- business_model
- target_customer
```

---

## 3.2 Foundational Memos

On onboarding:

* system generates memos from company_profile
* stored in memos table

```sql
memos
- id
- content
- type
- importance
- tags
- is_foundational (boolean)
```

---

## RULE:

* Foundational memos MUST always be included in context
* Foundational memos are never pruned

---

# 4. The Memo System (SYSTEM MEMORY)

## 4.1 Memo Types

### Foundational (Static)

* company identity
* market
* business model

### Operational (Dynamic)

* task outputs
* progress logs
* issues
* decisions

---

## 4.2 Memo Role

Memo is NOT a log.

Memo is:

* the **working memory of the company**
* the **primary context source for all agents**

---

# 5. Context Compiler (Deterministic)

Every agent receives compiled context.

## ALWAYS INCLUDE:

* Foundational memos
* Critical memos (issues, blockers)

## CONDITIONAL:

* Dependency-linked memos
* Recent execution memos

## OPTIONAL:

* Summarized historical memos

---

# 6. Orc (Chief of Staff)

Orc is the ONLY cognitive planner.

## Responsibilities:

1. Interpret founder goals
2. Ask clarifying questions (conversation mode)
3. Generate structured execution plans
4. Monitor execution state
5. Synthesize final reports

---

## Important:

Orc does NOT query departments.
Orc reads system state.

---

# 7. Execution Engine (TRUE DEFINITION)

Execution = deterministic task lifecycle system

## Components:

* Task Queue
* Dependency Resolver
* Worker Runner

---

## Task Flow:

1. Task enters queue
2. Dependencies checked
3. Agent executes
4. Output generated
5. Artefact stored (if needed)
6. Memo written
7. Task marked complete

---

## Dependency Rule:

* Tasks DO NOT execute if dependencies incomplete
* Failure blocks downstream tasks

---

# 8. Departments (Agents)

Departments are NOT persistent entities.

They are:

* execution roles assigned per task

---

## Model Strategy:

Each task can use:

* Reasoning Model (planning/logic)
* Execution Model (tool calls)
* Lightweight Model (memo writing)

---

# 9. Artefacts System

## Rule:

Large outputs MUST NOT live in DB.

---

## Artefacts Table:

```sql
artifacts
- id
- type (csv, code, doc, image)
- storage_path
- metadata
```

---

## Flow:

* agent generates output
* if large → upload to storage
* store reference in artifacts table
* memo references artifact_id

---

# 10. Storage Layer

* Object storage (S3-compatible)
* used for:

  * files
  * code outputs
  * datasets

---

# 11. HITL (Human-in-the-Loop)

No execution without approval.

* Orc proposes plan
* Founder approves
* Execution begins

---

# 12. Conversation Mode (CRITICAL)

* Orc can pause execution
* ask founder for clarification
* block dependent tasks

---

# 13. Failure & Feedback Loop

If:

* task fails
* data missing
* external issue detected

Then:

* memo created (critical)
* Orc notified
* system may re-plan

---

# 14. Final Synthesis

When all tasks complete:

* Orc generates report
* includes:

  * results
  * learnings
  * next actions

---

# 15. MVP Scope (STRICT)

Included:

* Cloud execution
* Supabase DB
* External storage (S3/R2)
* Composio tool layer

Excluded:

* Local models (Ollama)
* Onyx infrastructure
* Artefact preview system

---

# FINAL DEFINITION

Crost is:

> A state-driven execution system where
> Orc plans using structured company memory,
> and agents execute through a deterministic task engine.

```
```
