# Project Crost: Master Source of Truth
**Version:** 5.0 (LiteLLM Gateway & Secure Multi-tenancy)
**Last Updated:** April 10, 2026
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

---

*Crost: Think Global, Act Local. Built for the world's founders.*
