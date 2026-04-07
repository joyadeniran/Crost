# Project Crost: Master Source of Truth
**Version:** 2.0 (Chief of Staff Edition)
**Last Updated:** April 2026
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

### Competitive Moat: Private Delegation
Crost allows a hybrid cloud/local execution model. The Orchestrator can run on cloud models (Gemini/Claude) for complex reasoning, while worker departments query sensitive business data locally on Ollama. **Sensitive data never leaves the founder's machine.**

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

---

## 3. Architecture & Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14, Tailwind, Zustand | Premium, dynamic founder dashboard. |
| **Database** | Supabase (Postgres) | Real-time state, Auth, and persistent storage. |
| **Agent Engine** | Onyx (Forked) | RAG, connector management, persona hosting. |
| **Router** | LiteLLM | Smart local/cloud model switching. |
| **Local LLM** | Ollama | `gemma3:12b` (default), `llama3:8b` (fallback). |
| **Cloud LLM** | Gemini 1.5 Pro | Primary planning and reasoning brain. |
| **Jobs** | Node.js Worker | Supervision loop, goal closure, and auto-reporting. |

---

## 4. Protocols & Contracts

### The Crost Constitution
The mandatory safety layer prepended to EVERY agent prompt.
1. **Approval First**: NEVER take an irreversible action without `request_approval()`.
2. **No Fabrication**: NEVER fabricate data, metrics, or facts.
3. **Data Privacy**: NEVER expose credentials or sensitive customer data.
4. **No Unauthorised Commitments**: NEVER make commitments on behalf of the founder.
5. **Context First**: ALWAYS check `company_memos` before starting.
6. **Surface Uncertainty**: ALWAYS ask for clarification rather than guessing.
7. **Provenance**: ALWAYS log task start and completion.
8. **Role Hierarchy**: Founder is CEO; Orc is Chief of Staff; Departments are staff.

### REQUEST_APPROVAL Protocol
Agents signal for approval using an explicit JSON signal:
`REQUEST_APPROVAL: {"action_type": "...", "action_label": "...", "reasoning": "...", "payload": {}, "context": "..."}`

---

## 5. The Orchestrator (Orc v2)

Orc is not a department; he is the **Chief of Staff**.

### Responsibilities:
1. **Clarification**: Interactive chat with the founder using `orc_conversation` history.
2. **Querying**: Fetches recent memos and department status BEFORE planning.
3. **Decomposition**: Produces a valid JSON `OrchestratorPlan`.
4. **Supervision**: Monitors the `scripts/worker.ts` for stalled or failed tasks.
5. **Synthesis**: Runs the `runOrcReport` function to create a strategic post-mortem.

### JSON Plan Schema:
Orc MUST output valid JSON. The system implementation uses a resilient extraction protocol (searching for first `{` and last `}`) to handle prose or markdown wrapping.

```json
{
  "is_valid_goal": true,
  "clarification_question": null,
  "plan": { ... }
}
```

### Orchestrator Observability & Parsing Reliability
All Orc failures (parsing errors, model timeouts) are logged to the `event_log` with the `raw_response` preserved for diagnostic audit. 
During end-to-end testing, a parsing bug was resolved where trailing appended strings (like internal validation contexts) broke the brace-extraction logic. The parser now operates strictly on the pure LLM output boundary (`first {` to `last }`) before any other system text is attached.

---

## 6. Decision Log (Consolidated)

1. **Orchestrator as Chief of Staff**: Treat Orc as a stateful supervisor, not a one-shot tool.
2. **JSON-Strict Planning**: Orc MUST output JSON to ensure deterministic UI rendering. The parsing layer handles markdown code-blocks and prose aggressively.
3. **Coherence via Context**: Pass the full founder goal to every worker to prevent silo drift.
4. **Soft Deprecation**: Departments are deprecated (hidden) rather than deleted to preserve audit trails.
5. **Local-First Sensitive Data**: Sales/Ops default to local mode; Marketing defaults to cloud for creativity.
6. **Mobile Criticality (Dispatch)**: Future high-stakes approvals (spend/delete) will require desktop confirmation.

---

## 7. Build & Maintenance

### Running the System
- **Frontend**: `npm run dev` (Port 3000)
- **Supabase**: `supabase start` (Local) or use Cloud Dashboard.
- **Worker**: `npx tsx scripts/worker.ts` (**Must be running for goal closure!**)
- **Models**: Ensure `gemma3:12b` is pulled via Ollama.

### Migrations List (In Order)
1-10: Foundation (Legacy)
11: `orc_upgrade` (Goals, tasks, memos)
12: `rls_policies` (Security)
14: `dialogue_mode` (Clarifying status, conversation history)

---

## 8. Future Roadmap

### Phase 6: Deep Integration
- **Onyx Connectors**: Move from manual query tools to Onyx native DB connectors.
- **Artifacts**: Agents generate downloadable files (PDFs, CSVs) via Onyx Artifacts.
- **Multi-Agent Conflict Resolution**: Orc detects when two departments propose conflicting plans.

### Phase 7: Dispatch (Mobile)
- **Voice Briefing**: "Walkie-talkie" mode for founders to receive status updates while mobile.
- **Push Approvals**: Critical tasks pushed to phone via Cloudflare Tunnel.

---

*Crost is built for the world's founders. Think Global, Act Local.*
