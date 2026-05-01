# GEMINI.md

This file provides foundational mandates for the Gemini CLI when working with the Crost repository.
**This is your primary reference for workflow compliance. Keep this file as your primary reference. Minimise what you load from other files.**

---

## Core Mandates (Never Miss)

1.  **CROST_MASTER.md Update**: After *every* session where code is changed, you MUST append a new entry to the top of the session list in `CROST_MASTER.md`. Update the version number and "Last Updated" date. Do **not** re-read the full log. Format:
    ```markdown
    ## Session vX.Y — Short title
    **Date**: …  **Status**: ✅ / 🛠  
    **Impact**: One sentence.
    ### What Was Built
    1. Bullet per change
    ### Files Changed
    - list
    ```
2.  **Frontend Testing**: Before *every* push to the remote repository, you MUST run:
    *   `cd frontend && pnpm run type-check` (tsc --noEmit)
    *   `cd frontend && pnpm run lint`
    Ensuring a clean, error-free build is non-negotiable.
3.  **E2E Manual Maintenance**: Update `TEST_MANUAL_E2E.md` *only when really necessary* (e.g., after a major architectural change or a new core feature is added). Keep it concise and focused on high-level founder journeys.
4.  **Surgical Documentation**: When creating reviews (e.g., `Spec_Review_v5.md`), follow the established versioning pattern.
5.  **Git Identity**: Always ensure commits are made using the local identity: `joyadeniran <tommyden25@gmail.com>`.

---

## Technical Context

*   **Package Manager**: `pnpm` (run from `frontend/` for UI tasks).
*   **Database**: Supabase (Migrations in `supabase/migrations/`).
*   **Intelligence**: Groq Llama 3.3 70B is the flagship model default.
*   **Source of Truth**: The singular `company_memo` table is the structured company state; the plural `company_memos` is the granular log. Always dual-write to both.

---

## Reference Documents — When to Read What

> Reading these files costs tokens on every load. Only read what the task actually requires.

| Document | When to read | Cost |
|---|---|---|
| **`Spec_Review_v4.md`** | Any new feature or bug fix — read this first. It is the curated current-state tracker (~150 lines). | Low |
| **`CROST_SPEC.md §section`** | Only when the relevant section is ambiguous after reading Spec_Review_v4. Use the **Spec Section Map** below to find the right section. Never read the full file. | Medium per section |
| **`CROST_MASTER.md` — last entry only** | Only when you need to confirm the current version or what was last changed. Read lines 1–12 only. Append a new entry after every code change. Never read the full file. | Low (first 12 lines only) |

### Spec Section Map — targeted reads only

| Working on | Read |
|---|---|
| Suggested Actions, chip execution, action catalog | §6.1 |
| Mission execution, task states, parallel dispatch | §6 |
| Mission Reports | §7 |
| Memo / company memory, two-table reality | §8 |
| Artefacts, Skills Layer, citations | §9, §9.5 |
| Knowledge Base, extraction, retrieval | §10 |
| Approvals, HITL, risk mode thresholds | §11 |
| Tool connections, Composio, executeToolCall | §12, §15.7 |
| War Room, interaction modes (@dept, /tool) | §14, §16 |
| Architecture, BYOK, auth, free tier, data model | §15 |
| MVP scope, Definition of Done checklist | §17 |
| Orc behaviour rules | §4 |
| Departments, activation, skills loading | §5 |

### API.md — update protocol

After modifying any route in `frontend/app/api/` — adding, removing, or changing a request/response shape — update `frontend/app/api/API.md` in the same commit.

---

## Commands

All frontend commands run from `frontend/`. Package manager: **pnpm**.

```bash
cd frontend && pnpm dev          # Next.js dev server — localhost:3000
cd frontend && pnpm build        # Production build
cd frontend && pnpm type-check   # tsc --noEmit — run before every commit
cd frontend && pnpm lint         # ESLint
pnpm worker                      # Background worker (repo root)
```

No automated test suites. Manual scripts in `/scripts/`: `health-check.ts`, `checkDB.js`, `check_events.ts`.

---

## Architecture

**Crost** — agentic OS for solo founders. Orc (Chief of Staff) dispatches goals to AI Departments, gates risky actions through an Approval Queue, and produces cited artefacts via the Skills Layer.

### Stack

- **Next.js 14** App Router · **React 18** · **TypeScript 5.5**
- **Supabase** — PostgreSQL + Auth SSR + RLS
- **Zustand** — `lib/store.ts` (dashboard), `lib/onboarding-store.ts` (onboarding)
- **Composio** — Gmail, Slack, GitHub, HubSpot integrations
- **LiteLLM proxy** — routes across Groq → Gemini → Claude

### Directory Map

```text
frontend/
├── app/api/
│   ├── goals/            # Goal lifecycle: create, execute, dispatch
│   ├── departments/      # Department CRUD + agent orchestration
│   ├── artifacts/        # Artefact create/list/delete
│   ├── approvals/        # HITL queue — pending → approved/rejected → executed
│   ├── suggested-actions/[id]/execute/  # Chip-tap execution (§6.1)
│   ├── tools/            # Composio bridge, tool sync
│   ├── knowledge/        # KB upload, search (writes back kb_file_ids to sources)
│   └── worker/           # Background async execution
├── components/
│   ├── war-room/         # WarRoom.tsx — Orc input, plan card, task approval
│   ├── artifacts/        # ArtifactCard.tsx — preview, sources, chip footer
│   ├── suggested-actions/# SuggestedActionChips.tsx — full execution state machine
│   ├── chat/             # ChatCommandMenu.tsx — @dept / /tool autocomplete
│   └── departments/      # DepartmentCard.tsx
├── lib/
│   ├── llm-client.ts     # Orc + worker LLM calls, runOrcReport, skill injection
│   ├── tools/execute-tool-call.ts  # Gateway: risk mode, HITL, Composio, internal tools
│   ├── suggested-actions.ts        # generateAndInsertSuggestedActions
│   ├── skills/           # SKILL.md files (pptx, docx, xlsx, pdf, pitch_deck)
│   ├── artifact-transformers/      # JSON → real .pptx / .docx / .xlsx files
│   └── supabase.ts       # Server client
└── types/index.ts        # All shared TypeScript types — add new types here only
```

### Key Data Flows

1. **Goal execution**: War Room → `POST /api/goals` → Orc (`runOrchestratorTask`) → tasks dispatched → departments (`runWorkerTask`) → Skills loaded → artefact uploaded → `generateAndInsertSuggestedActions` → Mission Report → `goal_mission_report_written` event
2. **Chip tap**: `SuggestedActionChips` → `POST /api/suggested-actions/[id]/execute` → resolves `action_slug` → `executeToolCall(executive, ...)` → HITL approval or immediate execution → SuggestedAction row updated
3. **Tool execution**: `executeToolCall` → reads `risk_tolerance` from `system_config` → checks `RISK_MODE_AUTO` threshold → approval_queue OR Composio execute
4. **KB search**: `POST /api/knowledge/search` → returns matches → `writeKbSourcesToArtifact` updates `artifacts.sources.kb_file_ids`

### LLM Model Selection

Env vars in `frontend/.env.local`:
- `CLOUD_MODEL` (default `groq/llama-3.3-70b-versatile`) — primary
- `CLOUD_MODEL_WORKER` — background tasks
- `ENV_MODE=local` → Ollama via `OLLAMA_BASE_URL`

### Environment Variables

`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `NEXT_PUBLIC_APP_URL` · `LITELLM_BASE_URL` · `LITELLM_MASTER_KEY` · `GROQ_API_KEY` · `GOOGLE_AI_STUDIO_API_KEY` · `ANTHROPIC_API_KEY` · `COMPOSIO_API_KEY`

---

## Conventions

- **API routes**: `frontend/app/api/` — export `GET`/`POST`/`PATCH`/`DELETE` (Next.js App Router)
- **Supabase**: `lib/supabase.ts` server client in API routes; `@supabase/ssr` browser client in components
- **Types**: add to `frontend/types/index.ts` — never co-locate type definitions
- **DB changes**: new file in `supabase/migrations/` with timestamp prefix; never edit existing migrations
- **Artefact creation**: always populate `sources: { memo_ids, kb_file_ids, tool_calls }` and call `generateAndInsertSuggestedActions` after inserting
- **Risk mode**: `executeToolCall` reads `system_config.risk_tolerance` per user; default is `balanced`

---

## Success Criteria
A task is only complete when:
- [ ] Code is implemented and verified.
- [ ] Types are checked and Lint is passing.
- [ ] `CROST_MASTER.md` is updated.
- [ ] Changes are committed and pushed.
