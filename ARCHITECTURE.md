# Crost Architecture — Google Cloud AI Agents Challenge (Track 1)

## System Architecture

```mermaid
graph TB
    subgraph "Founder Interface"
        F[Founder Browser]
        DEMO[/demo — Live Demo Page/]
    end

    subgraph "Google Cloud Run"
        direction TB
        FE[Next.js Frontend\nCloud Run Service]
        W[Orc Worker\nCloud Run Job]
    end

    subgraph "Google ADK Agent Layer"
        direction TB
        ORC[OrcAgent\nLlmAgent — Chief of Staff\ngemini-2.0-flash]
        MKT[MarketingAgent\nLlmAgent]
        ENG[EngineeringAgent\nLlmAgent]
        SALES[SalesAgent\nLlmAgent]
        OPS[OperationsAgent\nLlmAgent]
    end

    subgraph "ADK Tools — FunctionTool"
        KB[search_knowledge_base]
        MEMO[write_to_memo]
        ART[create_artifact]
        APPR[request_human_approval]
        LOG[log_task_event]
    end

    subgraph "Google Cloud Infrastructure"
        direction LR
        GEMINI[Vertex AI\nGemini 2.0 Flash]
        SQL[Cloud SQL\nPostgreSQL 15]
        GCS[Cloud Storage\nArtifacts + KB Files]
        SCHED[Cloud Scheduler\nApproval Expiry]
        SM[Secret Manager\nAPI Keys + Credentials]
    end

    subgraph "Firebase (Google)"
        AUTH[Firebase Auth\nEmail + Google OAuth]
    end

    subgraph "MCP Protocol"
        MCPS[/api/mcp\nCrost MCP Server]
        EXT[External Agents\nClaude / Custom ADK]
    end

    F --> FE
    DEMO --> FE
    FE --> |POST /api/adk| ORC
    FE --> |SSE Stream| F

    ORC --> |ADK Runner| MKT
    ORC --> |ADK Runner| ENG
    ORC --> |ADK Runner| SALES
    ORC --> |ADK Runner| OPS

    ORC --> KB
    ORC --> MEMO
    ORC --> ART
    ORC --> APPR
    ORC --> LOG

    MKT --> KB
    MKT --> ART
    MKT --> APPR

    ORC --> GEMINI
    MKT --> GEMINI
    ENG --> GEMINI
    SALES --> GEMINI

    FE --> SQL
    W --> SQL
    FE --> GCS
    FE --> AUTH
    SCHED --> FE

    EXT --> MCPS
    MCPS --> ORC
```

## Agent Hierarchy

```
Runner (Google ADK)
├── appName: "crost"
├── agent: OrcAgent (LlmAgent)
│   ├── model: gemini-2.0-flash (Vertex AI)
│   ├── instruction: Chief of Staff system prompt
│   ├── tools: [search_kb, read_memo, write_memo, create_artifact, request_approval, update_goal, log_event]
│   └── sub-agents (loaded dynamically from Cloud SQL):
│       ├── MarketingAgent (LlmAgent, gemini-2.0-flash)
│       ├── EngineeringAgent (LlmAgent, gemini-2.0-flash)
│       ├── SalesAgent (LlmAgent, gemini-2.0-flash)
│       └── OperationsAgent (LlmAgent, gemini-2.0-flash)
├── sessionService: InMemorySessionService (→ DatabaseSessionService in prod)
└── artifactService: GcsArtifactService (Cloud Storage)
```

## Google Cloud Services Used

| Service | Purpose | Cost Profile |
|---------|---------|-------------|
| **Cloud Run** | Frontend + Worker deployment | ~$0 at low traffic (generous free tier) |
| **Cloud SQL** (PostgreSQL 15) | All application data | ~$7/month (db-f1-micro) |
| **Vertex AI / Gemini 2.0 Flash** | LLM for all agents | Pay-per-token (covered by $500 credits) |
| **Cloud Storage** | File artifacts + knowledge base | ~$0.02/GB/month |
| **Firebase Auth** | User authentication | Free tier (10K MAU) |
| **Secret Manager** | API keys and credentials | ~$0 at this scale |
| **Cloud Scheduler** | Approval expiry cron | Free (3 jobs) |
| **Cloud Build** | CI/CD pipeline | First 120 min/day free |

## ADK Integration Points

1. **`@google/adk` v1.2.0** — Core agent framework
2. **`LlmAgent`** — OrcAgent + all DepartmentAgents
3. **`FunctionTool`** — All Crost capabilities (KB, memos, artifacts, approvals)
4. **`GcsArtifactService`** — Artifact storage on Cloud Storage
5. **`Runner`** — Orchestrates agent execution with session management
6. **`McpToolset`** (via `/api/mcp`) — Exposes Crost as MCP server

## Data Flow

```
Founder Input
    ↓
POST /api/adk
    ↓ Create goal in Cloud SQL
    ↓ Start ADK Runner
OrcAgent (Gemini 2.0 Flash)
    ↓ search_knowledge_base → Cloud SQL
    ↓ read_company_memo → Cloud SQL
    ↓ (Plan: 3-5 tasks)
    ↓ Transfer to DepartmentAgent
DepartmentAgent (Gemini 2.0 Flash)
    ↓ Execute task
    ↓ create_artifact → Cloud Storage
    ↓ request_human_approval → Cloud SQL (if external action)
    ↓ write_to_memo → Cloud SQL
    ↓ Return to OrcAgent
OrcAgent
    ↓ Synthesize results
    ↓ write_to_memo (Mission Report)
    ↓ update_goal_status (completed)
    ↓ SSE stream → Founder browser
```

## MCP Server (`/api/mcp`)

Crost exposes itself as a Model Context Protocol server, enabling:
- **Claude Desktop** to use Crost as a tool
- **Other ADK agents** to delegate work to Crost
- **Enterprise integrations** via MCP protocol

Available tools:
- `crost_run_goal` — Submit a goal for execution
- `crost_get_goal_status` — Check execution progress
- `crost_search_knowledge` — Query company knowledge
- `crost_list_departments` — List available agents
- `crost_get_memos` — Get company state

## Security Model

- All external actions require **human approval** before execution
- Firebase Auth with **verified email** required
- API keys stored in **Google Secret Manager**
- Cloud Run services use **service account IAM** (no hardcoded credentials)
- Row-level scoping: every query filters by `created_by = userId`

## Codebase Module Map (post-10x-rebuild)

`frontend/lib/llm-client.ts` (originally 1,744 lines — "the god module") was
split in Phase 2 into `frontend/lib/engine/`, and now exists only as a
19-line barrel re-export so nothing else broke during the migration:

| Module | Responsibility |
|---|---|
| `engine/model.ts` | `getModel`, `CLOUD_MODEL`, `callLiteLLM`, `callLLM`, `callEmbeddings` |
| `engine/prompt.ts` | `buildFinalPrompt`, `buildOrcContext`, `getModeInstructions`, `formatConversationHistory` |
| `engine/parse.ts` | `parseApprovalRequest`, `extractJsonObject`, `parseOrchestratorResponse`, `normalizeClarification` |
| `engine/orchestrator.ts` | `runOrchestratorTask` (Orc's planning loop), `runOrcReport` (Mission Report synthesis, spec §7) |
| `engine/worker.ts` | `runWorkerTask` (department task execution) |
| `engine/memo.ts` | `getMemoBrief`, `getMemos`, `saveContextMemo` |
| `engine/budget.ts` | `checkTokenBudget` |
| `engine/events.ts` | `logEvent` |
| `engine/departments.ts` | Department resolution helpers |

Other load-bearing `lib/` modules introduced or hardened during the
rebuild:

| Module | Responsibility |
|---|---|
| `lib/auth/guard.ts` | Central auth guard (`requireUser`, `requireUserOrInternal`) — replaces per-route copy-pasted session/internal-secret checks (Phase 2.3) |
| `lib/env.ts` | Zod-validated required env vars, fail-fast at boot (Phase 2.4) |
| `lib/api-response.ts`, `lib/errors.ts` | Uniform `apiOk`/`apiError` response shape + error taxonomy |
| `lib/log.ts` | Structured JSON-lines logging (`level`, `message`, `userId`, `goalId`, `taskId`, `module`) — rolled out to `lib/engine/*` (Phase 3) |
| `lib/dual-write-log.ts` | Shared helper making `company_memo` dual-write failures observable instead of silently swallowed (Phase 5, spec §8) |
| `lib/state-machine.ts` | Characterization-based status transition tables for goals/goal_tasks/approval_queue/artifacts (Phase 3) |
| `lib/db.ts` | The one canonical Cloud SQL `pg` client (`createDbClient`), including guarded conditional-upsert support (atomic dispatch claim, Phase 3) |
| `lib/company-memo.ts` | Singular `company_memo` table CRUD — the spec §8 structured source of truth |
| `lib/suggested-actions.ts`, `lib/execute-suggested-action.ts` | Suggested Next Actions generation (spec §6.1) and execution gateway — note: `execute-suggested-action.ts`'s gateway is not wired to any current UI caller and writes status values/columns that don't exist in the live schema; the actually-used execution path is `app/api/suggested-actions/[id]/execute/route.ts` |
| `scripts/worker.ts` | Separate root-level polling supervisor (own `package.json`, no shared tsconfig/test runner) — bounded retry/backoff/dead-letter reaper for stalled tasks (Phase 3) |

`app/api/**` routes call into `lib/engine/*` and the modules above; nothing
in `app/api/**` should read `userId` from a request body without going
through `requireInternal`/`requireUserOrInternal`.

## Challenge Track: Track 1 — Build Net-New Agents

This submission demonstrates:
1. ✅ Net-new multi-agent system built with Google ADK
2. ✅ ADK's `LlmAgent` + `FunctionTool` + `Runner` architecture  
3. ✅ MCP server for external agent interoperability
4. ✅ Google Cloud Vertex AI (Gemini 2.0 Flash) as the model backbone
5. ✅ Full deployment on Google Cloud (Cloud Run + Cloud SQL + Cloud Storage)
6. ✅ Human-in-the-loop approval gates (founder control)
7. ✅ Real business value: autonomous company operations for founders
