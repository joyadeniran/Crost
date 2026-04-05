# Crost — Decisions Log
**Every architectural decision made across all sessions. Do not re-litigate these.**
**If you think one of these should change, flag it explicitly rather than silently overriding it.**

---

## Product Decisions

### Orchestrator ships in MVP
**Decision:** The Orchestrator is part of the MVP. Not v1.1.
**Why:** The third advisor synthesis showed that the goal → plan → approve → execute loop IS the product. Without the orchestrator, Crost is just a department dashboard. The orchestrator is what makes it feel like "talking to your company."
**Constraint:** It ships with 3 worker departments and 3 hardcoded tools. No more. Scope is controlled by limiting what the orchestrator can fan out to.

### Orchestrator outputs JSON only — never prose
**Decision:** The orchestrator system prompt enforces raw JSON output. No markdown, no explanation text, no code blocks.
**Why:** JSON output is what makes the system deterministic. The UI renders it. The approval feed parses it. The workers consume typed task objects. Prose output breaks the entire pipeline.
**Implication:** The orchestrator system prompt must end with explicit enforcement: "You MUST respond with valid JSON only. No prose before or after."

### Local identity injected at position 3 — not Phase 5
**Decision:** Tone injection happens during Phase 2 (building the orchestrator), not as a final polish pass.
**Why:** Local identity affects how the orchestrator frames tasks to workers and how workers produce customer-facing outputs. A system that works technically but sounds generic fails the product promise. Inject early, test early.

### Workers receive typed task objects — not natural language
**Decision:** The orchestrator dispatches `WorkerTask` objects (typed JSON) to workers. Workers do not receive chat messages from the orchestrator.
**Why:** Clean trust boundaries. Deterministic parsing. The approval feed is approving a typed object, not interpreting a paragraph. Makes testing trivial.

### Workers still have the constitution — minimum 3 clauses
**Decision:** Even "dumb" workers have the 3-clause MVP constitution injected.
**Why:** A worker with a live Supabase query tool and no safety rules is a liability. The constitution cannot be zero. "Dumb" means limited scope, not zero safety.

### Fan-out only after selective plan approval
**Decision:** The orchestrator plan is shown to the founder before any task executes. Each task is individually approvable. Approve All exists as a shortcut, not the default state.
**Why:** This is the HITL gate applied at goal level. Without it, a single orchestrator decision can trigger 3+ irreversible actions simultaneously. The blast radius must be gated.

### reasoning field is mandatory on every approval
**Decision:** Any `REQUEST_APPROVAL` without a populated `reasoning` field is automatically rejected and logged as a malformed request.
**Why:** Founders approve arguments, not just actions. A missing reasoning field means the agent is asking for a trust click, not an informed decision. The system must structurally prevent this.

---

## Infrastructure Decisions

### Cloudflare Tunnel over Ngrok (for Dispatch, when built)
**Decision:** When the Dispatch mobile app is built (v1.1), use Cloudflare Tunnel.
**Why:** Ngrok sessions drop on laptop sleep and have rate limits on the free tier. Cloudflare Tunnel is persistent, free, and production-grade for this use case. One command: `cloudflared tunnel run crost`.

### Expo web before React Native (for Dispatch, when built)
**Decision:** Dispatch starts as an Expo web build, not a native app.
**Why:** One codebase, runs on any mobile browser immediately, no app store review cycle. Ship web first, go native when you have users who need it. React Native adds 2-3 weeks of build infrastructure for no user-facing benefit at MVP.

### Soft deprecation over hard delete by default
**Decision:** Departments are soft-deprecated first. Hard delete requires typing the department name and is only available after soft deprecation.
**Why:** Deleting a department destroys audit history. Founders may need to revisit what a department did, what it promised, what approvals it requested. Hard deletes cascade the approval_queue but preserve company_memos body.

### LifecycleResult<T> over throws in department-lifecycle.ts
**Decision:** All functions in `department-lifecycle.ts` return `LifecycleResult<T>` — they never throw.
**Why:** API routes need to map errors to HTTP status codes cleanly. Exceptions require nested try/catch in every route and make error handling inconsistent. The result type pattern means every function's failure modes are explicit and typed.

### Memo brief fetched fresh on every call — never cached
**Decision:** `getMemoBrief()` in `onyx-client.ts` hits Supabase on every call. No caching.
**Why:** Memos can be written by any department at any time. Caching the brief means a department could miss a critical memo written moments before it starts a task. Freshness is more important than latency.

### resolveActiveModel() reads env_mode on every call — never cached
**Decision:** `resolveActiveModel()` in `onyx-client.ts` reads `env_mode` from `system_config` on every call.
**Why:** The mode toggle can change mid-session. A cached mode means a task could run on the wrong model after a toggle. The Realtime broadcast updates the UI immediately but the model resolver must also read fresh.

### Gemma 3 as default local model over Llama 3
**Decision:** `gemma3:12b` is the default. `llama3:8b` is pulled as a fallback for engineering/tool-calling tasks.
**Why:** Gemma 3 handles multilingual instruction-following and culturally contextualised tone prompts more consistently. This is critical for Crost's global-first positioning. Gemma 3 12B outperforms Llama 3 8B on most reasoning benchmarks at similar resource requirements.

---

## Safety Decisions

### Constitution structurally first — always
**Decision:** The Crost Constitution is always position 1 in the prompt assembly. It cannot be pushed down by any department configuration.
**Why:** This mirrors how Anthropic structures Claude's own safety rules. Safety rules at the top of the context window have stronger influence over model behaviour than rules buried in the middle. No department config can reorder this.

### Local mode gets stricter approval thresholds
**Decision:** When `env_mode` is `local`, medium-risk actions require explicit approval (they don't auto-execute based on `risk_tolerance`). In cloud mode, the founder's `risk_tolerance` setting governs auto-execution.
**Why:** Local models (Gemma 3, Llama 3) have weaker RLHF-based safety alignment than Claude 3.5 Sonnet or Gemini 1.5 Pro. The constitution compensates, but the approval threshold should also be stricter to compensate for the lower model safety floor.

### Critical-level approvals require desktop confirmation (when Dispatch is built)
**Decision:** `spend_budget`, `delete_data`, `merge_code` require desktop confirmation by default even in Dispatch. An explicit opt-in in `system_config` enables mobile critical approvals.
**Why:** A founder approving `spend_budget` from Lagos traffic — distracted, small screen, time pressure — is not the same context as a desktop approval. Mobile creates real risk of hasty high-stakes decisions. This is a constitutional rule, not a UX preference.

### Inter-agent trust: agent memos have lower trust than founder memos
**Decision:** `company_memos.source_type` distinguishes "founder" | "agent" | "orchestrator" | "external". The constitution assigns lower trust weight to agent-originated content.
**Why (deferred to Phase 2):** A compromised or hallucinating department could write a memo that manipulates another department into requesting a critical approval. Memo provenance is the first line of defence. This is not in MVP but the schema field is added now so it doesn't require a migration later.

---

## Business Decisions

### BYOK for MVP — no managed billing
**Decision:** Founders provide their own API keys for cloud LLMs. Crost does not proxy API calls or charge for usage in MVP.
**Why:** Zero billing infrastructure, zero compliance overhead, zero liability for API costs. Managed Cloud (Crost proxies API calls, charges a fee) is Phase 2 once user volume justifies the infrastructure.

### Orchestrator + Dispatch bundled as Crost Pro (v1.1)
**Decision:** Orchestrator is in the free tier (MVP). Dispatch (mobile) + advanced orchestrator features are the Pro tier at $29/month.
**Why:** The orchestrator is table-stakes for the core value proposition — it cannot be paywalled. Dispatch is a premium access mode: "Leave your desk without your business stopping." That's the Pro upsell. Do not gate orchestrator separately from Dispatch.

### No department count limit in MVP
**Decision:** No hard limit on department count. UI collapses deprecated departments.
**Why:** Arbitrary limits create friction without adding safety. The health score system (Phase 2) will gate scaling more intelligently than a hard number. Revisit at scale.

### Tool connection deferred from onboarding
**Decision:** Tools (OAuth flows, API keys) are connected contextually — when an agent first needs a tool — not during onboarding.
**Why:** Tool connection during onboarding causes drop-off before the founder has experienced value. Tool connection becomes a reward for engagement: "Connect Gmail to let Marketing send this outreach." This is not a convenience decision — it's a retention decision.

### "Private Delegation" is the competitive positioning
**Decision:** The online/local toggle is marketed as "Private Delegation." The orchestrator can use cloud intelligence for planning while sensitive business data (retailer database, financial records) stays on the founder's machine on Ollama.
**Why:** No competitor offers this split. Lindy runs fully in the cloud. Base44 has no local mode. This is the moat. Every feature decision that touches the toggle must preserve and reinforce this positioning.

---

## Decisions Still Open

| Question | Context | Status |
|----------|---------|--------|
| Crost Registry | Community template marketplace for department configs | Design export format now, launch Phase 2 |
| Multi-founder access | Multiple users sharing one Crost instance | Out of scope for MVP — single-founder model only |
| Mobile experience | Responsive breakpoints | In spec but not designed in detail |
| Department health score | Health gate for scaling | Phase 2 design needed |
| Prompt injection defence | Memo sanitisation, untrusted content wrapper | Phase 2 — schema field added now |
| Rollback mechanism | Per-action rollback_context store | Phase 3, before public launch |
| Tool scoping | Scope constraints within tools | Phase 2 before 10+ departments |

---

## What "Done" Looks Like

The MVP is complete when a founder can:
1. Complete onboarding (local identity set, 3 departments activated)
2. Type a goal in the War Room
3. See a structured JSON plan with risk note
4. Approve selectively per task
5. See approved workers execute and write results to memos
6. See the activity feed update in real time
7. Toggle to local mode mid-session and repeat — no data leaves the machine

That is the loop. Ship that. Everything else is v1.1.
