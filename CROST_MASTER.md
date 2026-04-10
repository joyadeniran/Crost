# Project Crost: Master Source of Truth
**Version:** 3.7 (Core Loop Hardening)
**Last Updated:** April 9, 2026 (18:00 UTC)
**Purpose:** The single, definitive record of the Crost project. This file replaces all previous roadmap, spec, and context documents.

---

## 1. Executive Summary & Vision

Crost is an **Agentic Operating System for solo founders**. It is a structured "Agent Office" where each department is a semi-autonomous AI agent.

### The Core Loop
1. **Founder Goal**: Founder inputs a strategic objective in the War Room.
2. **Orc Planning**: The Orchestrator (Chief of Staff) queries departments, identifies context, and drafts a structured JSON plan.
3. **Collaborative Dialogue**: If the goal is ambiguous, Orc pauses to ask clarifying questions before committing.
4. **HITL Gate**: Founder reviews, modifies, and approves/rejects individual tasks.
5. **Fan-out Execution**: Approved tasks are dispatched to workers (Sales, Marketing, Ops, etc.).
6. **Strategic Synthesis**: Upon goal completion, Orc synthesizes all department memos into a strategic "Orc Report" with recommended next steps.

---

## 2. Implementation Progress (Built & Active)

| Feature | Phase | Status | Description |
| :--- | :--- | :--- | :--- |
| **Foundational Infrastructure** | 0 | ✅ Done | Supabase, Onyx, LiteLLM, Ollama, Docker integration. |
| **Dynamic Department Routing** | 1 | ✅ Done | Orc fetches active depts from DB; no hardcoded "Sales/Marketing/Ops" limits. |
| **Worker Coherence** | 2 | ✅ Done | Workers receive "Coherence Blocks" (Founder goal + peer awareness). |
| **Founder Overrides** | 3 | ✅ Done | UI allows editing task labels/reasoning before dispatch. |
| **Strategic Synthesis** | 4 | ✅ Done | Orc automatically generates post-mortem reports upon goal completion. |
| **Dialogue Mode** | 5 | ✅ Done | Interactive clarification phase with persistent conversation history. |
| **Intelligence Architecture v5.0** | 5.5 | ✅ Done | Strict model routing, bounded context memo injection, and strict JSON output schemas. |
| **MCP & Tools System v1** | 6.0 | ✅ Done | Lightweight Model Context Protocol layer for fetching data and executing mock actions. |
| **Artifacts & Notifications** | 6.5 | ✅ Done | Dedicated Artifacts gallery and Inbox hub with decoupled settings. |
| **Waitlist & Landing v2** | 6.8 | ✅ Done | Brevo-powered waitlist, premium scroll animations, and mobile-responsive landing. |
| **Composio Deep Tooling** | 7.0 | ✅ Done | Pivoted from Nango to Composio: Managed OAuth, entity-based tool execution, and unified tool_call protocol. |
| **Strategic Onboarding** | 8.0 | ✅ Done | 4-screen premium setup flow with deferred completion and auth-gate middleware. |
| **Aesthetic Overhaul** | 8.5 | ✅ Done | Glassmorphism, premium accent glow, and centralized global styling (anti-FOUC). |
| **Zero-Poll Optimization** | 8.8 | ✅ Done | Transitioned supervisor to Supabase Realtime; implemented data pruning to cut egress by 90%. |
| **Identity Standardisation** | 8.9 | ✅ Done | Resolved [Object Object] bugs; separated Founder vs Company identity for high-fidelity AI context. |
| **Crost Security v1.0** | 9.0 | ✅ Done | Enforced RLS across all tables; unified ownership via `created_by` column. |
| **Hardening v1.1** | 9.1 | ✅ Done | Implemented mandatory Rate Limiting, stubbed Onyx lifecycle for MVP, and fixed worker 404s. |
| **Core Loop Hardening** | 9.2 | ✅ Done | Automated chain-reactions, synthesis idempotency, and re-plan task cleanup. |

---

## 5. The Orchestrator (Orc v2)

Orc is not a department; he is the **Chief of Staff**.

### Responsibilities:
1. **Clarification**: Interactive chat with the founder using `orc_conversation` history.
2. **Querying**: Fetches recent memos and department status BEFORE planning.
3. **Decomposition**: Produces a valid JSON `OrchestratorPlan`.
4. **Supervision**: Monitors the `scripts/worker.ts` for stalled or failed tasks.
5. **Synthesis**: Runs the `runOrcReport` function to create a strategic post-mortem.
6. **Task Hygiene**: Automatically clears old `pending` tasks when re-drafting a plan to prevent UI orphans.

---

## 6. Decision Log (Consolidated)

1. **Orchestrator as Chief of Staff**: Treat Orc as a stateful supervisor, not a one-shot tool.
2. **JSON-Strict Planning**: Orc MUST output JSON to ensure deterministic UI rendering.
3. **Coherence via Context**: Pass the full founder goal to every worker to prevent silo drift.
4. **Soft Deprecation**: Departments are deprecated (hidden) rather than deleted to preserve audit trails.
5. **Local-First Sensitive Data**: Sales/Ops default to local mode; Marketing defaults to cloud for creativity.
6. **Token Protection & Truncation**: Memo bodies are truncated to 800 chars internally to prevent worker crashes.
7. **Active Re-clarification**: If a worker hits `needs_data`, it dynamically updates `orc_conversation` and flips the goal back to `clarifying`.
8. **Mobile Criticality (Dispatch)**: Future high-stakes approvals (spend/delete) will require desktop confirmation.
9. **Execution Safety (Gate)**: MCP Tool calls are awaited synchronously.
10. **Aesthetic Premium**: Vanilla CSS is used for custom layouts (wow factor).
11. **Composio Entity Isolation**: Every founder is a Composio Entity.
12. **Protocol Pivot (tool_call)**: Standardised on the `tool_call` JSON pattern for workers.
13. **FOUC Elimination**: Migrated all component-level `styled-jsx` into a centralized `globals.css`.
14. **Deferred Completion State**: Split onboarding into `activated` and `complete` phases.
15. **Auth Hardening (SSR)**: Enforced cookie-aware clients for all identity checks.
16. **Multi-Tenant Isolation**: Implemented `created_by` across all core tables (Goals, Departments, Memos, Approvals, Events).
17. **Hard Session Refresh**: Use `supabaseClient.auth.refreshSession()` for onboarding transitions.
18. **Synthesis Idempotency**: `runOrcReport` checks for existing reports to prevent duplicate synthesis.
19. **Manual Closure Synthesis**: Synthesis is triggered even on manual goal completion via the API.
20. **Chain-Reaction Dispatch**: Secure internal bypass (`x-crost-internal-secret`) allows automated dispatch of dependency-satisfied tasks.

---

## 7. Build & Maintenance

### Running the System
- **Frontend**: `npm run dev` (Port 3000)
- **Supabase**: `supabase start` (Local)
- **Worker**: `npx tsx scripts/worker.ts` (Must be running for goal closure!)

### Migrations List (In Order)
1-10: Foundation (Legacy)
11: `orc_upgrade` (Goals, tasks, memos)
12: `rls_policies` (Security)
14: `dialogue_mode` (Clarifying status, conversation history)
15: `v5_task_states` (Execution state machine)
16: `20260408_create_connections_table.sql` (Composio Deep Tooling)
17: `20260409_multitenant_fix.sql` (Privacy isolation & RLS)
18: `auth_client_refactor` (SSR cookie security fixes)
19: `20260409050000_fix_task_tenant.sql` (Enforced ownership on goal_tasks)

---

*Crost is built for the world's founders. Think Global, Act Local.*
