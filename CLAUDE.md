# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

| File | Purpose |
|------|---------|
| [`CROST_SPEC.md`](CROST_SPEC.md) | Product and technical specification — source of truth for intended behavior |
| [`CROST_MASTER.md`](CROST_MASTER.md) | Implementation log — session history, deployment notes, recent fixes |

**IMPORTANT:**
- **Before starting any new build phase**, read `CROST_SPEC.md` to align implementation with the spec.
- **After every successful implementation**, append a summary entry to `CROST_MASTER.md` (session version, what was built, any notable decisions or fixes).

## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

---

## Commands

All frontend commands run from the `frontend/` directory. Package manager is **pnpm**.

```bash
# Development
cd frontend && pnpm dev          # Next.js dev server on localhost:3000

# Build & type check
cd frontend && pnpm build        # Production build
cd frontend && pnpm type-check   # tsc --noEmit (run before committing)
cd frontend && pnpm lint         # ESLint

# Background worker
pnpm worker                      # Runs scripts/worker.ts via tsx (root package)
```

There are no automated test suites. Manual validation scripts are in `/scripts/`:
- `health-check.ts` — API health & Onyx availability
- `checkDB.js` / `check_events.ts` — DB connectivity and event log verification

---

## Architecture

**Crost** is an agentic OS for solo founders. AI **Departments** (Sales, Marketing, Ops, custom) execute goals autonomously. A supervisor agent called **Orc** dispatches goals to departments and gates risky actions through an **Approval Queue**.

### Tech Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript 5.5**
- **Supabase** — PostgreSQL, Auth (SSR), Row Level Security
- **Tailwind CSS** + **Radix UI** — styling and component primitives
- **Zustand** — client-side global state (`/frontend/lib/store.ts`, `onboarding-store.ts`)
- **Composio** — external tool integrations (Gmail, Slack, GitHub, etc.)
- **LiteLLM proxy** — routes LLM calls; falls back across Groq → Gemini → Claude → Ollama

### Directory Map

```
frontend/
├── app/
│   ├── dashboard/          # Main UI (departments, war room, artifacts, event log)
│   ├── onboarding/         # 5-step setup flow (identity → control → orc → team → activate)
│   ├── auth/, login/, signup/  # Supabase SSR auth pages
│   └── api/
│       ├── goals/          # Goal lifecycle: create, execute, close
│       ├── departments/    # Department CRUD and agent orchestration
│       ├── artifacts/      # AI-generated memos, reports, documents
│       ├── approvals/      # Approval queue (pending → approved/rejected → executed)
│       ├── tools/          # Tool execution, Composio bridge, connection sync
│       ├── connect/        # OAuth flows for external integrations
│       ├── knowledge/      # Knowledge base (uploaded context files)
│       └── worker/         # Background async execution
├── components/
│   ├── war-room/           # Goal input, real-time execution state, results
│   ├── departments/        # Department cards and configuration
│   ├── chat/               # Command menu (@dept, /tool triggers)
│   ├── artifacts/          # Memo and document viewer
│   ├── approvals/          # Approval decision UI
│   └── ui/                 # Shared Radix + Tailwind primitives
├── lib/
│   ├── llm-client.ts       # LLM routing across all providers
│   ├── tools/execute-tool-call.ts  # Composio tool invocation
│   ├── artifact-transformers/      # Goal → Word/PDF/Markdown generation
│   ├── composio-tools.ts   # Composio API wrapper
│   └── supabase.ts         # Supabase server client
└── types/index.ts          # All shared TypeScript types

scripts/                    # CLI utilities (tsx, run from repo root)
supabase/migrations/        # SQL DDL — schema changes go here
litellm/litellm_config.yaml # LLM proxy model definitions
```

### Key Data Flows

1. **Goal execution**: War Room → `POST /api/goals` → Orc agent → department agent → tool calls via Composio → events logged → result streamed back
2. **Approval queue**: Risky tool call → `POST /api/approvals` → founder reviews → `PATCH /api/approvals/:id` → tool executes
3. **Tool connections**: `GET /api/tools/sync` verifies Composio connections and auto-heals stale ones (just-in-time)
4. **LLM routing**: `lib/llm-client.ts` checks `ENV_MODE` and `CLOUD_MODEL` env vars to select provider; graceful fallback chain

### LLM Model Selection

Controlled by env vars in `.env.local`:
- `ENV_MODE=cloud` + `CLOUD_MODEL=groq/llama-3.3-70b-versatile` (default cloud)
- `ENV_MODE=local` uses Ollama via `OLLAMA_BASE_URL`
- Override per-call with `CLOUD_MODEL_WORKER` for background tasks

### Environment Setup

Copy `frontend/.env.example` → `frontend/.env.local` and fill in:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `NEXT_PUBLIC_APP_URL` | App root (`http://localhost:3000` for dev) |
| `LITELLM_BASE_URL` | LiteLLM proxy (`http://localhost:4000`) |
| `LITELLM_MASTER_KEY` | Proxy auth key |
| `GROQ_API_KEY` / `GOOGLE_AI_STUDIO_API_KEY` / `ANTHROPIC_API_KEY` | LLM provider keys |
| `COMPOSIO_API_KEY` | Tool integrations |

---

## Conventions

- **API routes** live in `frontend/app/api/` and export `GET`/`POST`/`PATCH`/`DELETE` handlers (Next.js App Router)
- **Server vs client Supabase**: use `lib/supabase.ts` server client in API routes; `@supabase/ssr` browser client in components
- **Types**: all shared types are in `frontend/types/index.ts` — add new types there rather than co-locating
- **DB changes**: create a new file in `supabase/migrations/` with a timestamp prefix; never edit existing migrations
- **State**: Zustand store in `lib/store.ts` for dashboard state; `lib/onboarding-store.ts` for setup flow only
