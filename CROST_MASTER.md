# Project Crost: Master Source of Truth
**Version:** 4.1 (State-Driven Context & Waterfall Hardening)
**Last Updated:** April 10, 2026
**Purpose:** The single, definitive technical and operational specification of Crost. This document merges all previous architectures and roadmaps into one source of truth.

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
3. **Execution Layer**: Deterministic task engine and worker runners.
4. **State Layer**: The "Working Memory" (Memos, goal_tasks, event_log).
5. **Storage Layer**: External artifacts (Supabase Storage/S3) for large data.

---

## 3. The Memo System (System Memory)

The Memo is the **primary context source** for all agents. It is the working memory of the company.

### 3.1 Memo Types
- **Foundational (Static)**: Company identity, business model, founder vision. (`is_foundational: true`).
- **Context (Temporal)**: Founder answers to clarifying questions or `needs_data` requests. (`is_current_context: true`).
- **Operational (Dynamic)**: Task outputs, tool results, research findings. (`task_id` linked).

### 3.2 Context Synchronization
Workers perform a **"Context Sync"** as the first step of every task.
- **Tier 1 (Core)**: Foundational + Current Context (Always included).
- **Tier 2 (Critical)**: Urgent memos (Always included).
- **Tier 3 (Relevant)**: Goal-specific memos and high-priority recent updates (Conditional).
- **Tier 4 (Historical)**: Summarized or title-only logs (Optional).

---

## 4. The Orchestrator (Orc v2.1)

Orc is the **Chief of Staff**, the only cognitive planner in the system.

### 4.1 Planning Logic & Constraints
- **Centralized Research**: If a goal requires general market data, Orc inserts a **"Master Research Task"** at the top of the plan. Subsequent tasks depend on this and read its memo.
- **Brain vs. Tool**: Orc instructs workers to use tools *only* for data the LLM cannot know (real-time news, private DB records). General strategy uses the "Brain".
- **JSON-Strict**: Orc MUST output valid JSON for deterministic UI rendering.
- **Dialogue Mode**: Orc pauses execution to ask clarifying questions if the goal is ambiguous.

---

## 5. Execution Engine & Strict Waterfall

Execution is a deterministic task lifecycle system.

### 5.1 The Dependency Gate
Crost enforces a **Strict Waterfall**:
- A task cannot transition from `planned` to `running` until its dependencies reach `status: completed`.
- **Data Verification**: Even if a task is "completed", downstream tasks stay blocked until the `company_memos` table contains a record matching the dependency's `task_id`. This ensures the hand-off is backed by real data.

### 5.2 Artifacts System
Large outputs (>5000 chars) are offloaded to Supabase Storage. The DB stores a reference in the `artifacts` table, and the Memo provides a summary and a link.

---

## 6. Decision Log (Consolidated)

1-25. (See Legacy Logs for items 1-25 including Composio pivot, Onboarding screens, and RLS Hardening).
26. **Information Loop Redundancy**: User answers are saved as `is_current_context` memos with `valid_until` timestamps to prevent agents from asking the same questions twice.
27. **Centralized Research**: Orc consolidates redundant web searches into one "Master Research Task" to save tokens and ensure a single source of truth for market data.
28. **Strict Waterfall Verification**: Dependencies are now gated by both task status AND the physical existence of a result memo in the DB.
29. **Context Versioning**: Added `is_current_context` to differentiate between permanent identity and task-specific ephemeral context.
30. **Brain vs. Tool Differentiator**: Explicit system rules to prevent unnecessary tool calls for common knowledge tasks.

---

## 7. Implementation Progress

| Feature | Phase | Status | Description |
| :--- | :--- | :--- | :--- |
| **Core Infrastructure** | 0 | ✅ | Supabase, Onyx, LiteLLM, Composio. |
| **Memo Memory System** | 1 | ✅ | Tiered context, foundational/current context split. |
| **Orc Planning v2.1** | 2 | ✅ | JSON plans, Master Research, Brain vs Tool logic. |
| **Waterfall Execution** | 3 | ✅ | Strict dependency gating with memo verification. |
| **Context Sync** | 4 | ✅ | Automated injection of user responses into worker brains. |
| **Strategic Synthesis** | 5 | ✅ | Post-mortem Orc Reports and strategic next steps. |

---

## 8. Build & Maintenance

### Running the System
- **Frontend**: `npm run dev` (Port 3000)
- **Supabase**: `supabase start` (Local)
- **Worker**: `npx tsx scripts/worker.ts` (Supervises stall detection and goal closure).

### Critical Migrations (Order Matters)
- `orc_upgrade`: Goals, tasks, memos enhancements.
- `rls_policies`: Multi-tenant security.
- `dialogue_mode`: Clarification thread and `orc_conversation`.
- `20260410020000_context_memos`: Adds `valid_until` and `version_tag`.
- `20260410030000_add_current_context`: Adds `is_current_context` and `task_id` to memos.

---

*Crost: Think Global, Act Local. Built for the world's founders.*
