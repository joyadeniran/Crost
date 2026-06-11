# Google for Startups AI Agents Challenge
## Track 1: Build Net-New Agents
## Submission: Crost — AI Company Operating System

**Devpost deadline:** June 11, 2026 at 5:00 PM PT

---

## What is Crost?

Crost is a **Human-in-the-Loop Company Operating System** where AI agents simulate departments, coordinated by a central Chief of Staff (Orc), to help a founder run a company.

**Not a chatbot. An office.**

The founder types one goal. Crost plans it, executes it across specialist departments, and delivers results — asking for approval before any external action.

---

## Why Track 1?

We built a net-new multi-agent system from scratch using Google ADK:

- **OrcAgent** (Chief of Staff) — `LlmAgent` powered by Gemini 2.5 Flash
- **DepartmentAgents** (Marketing, Engineering, Sales, Research, Operations) — sub-agents spawned dynamically from the database
- **FunctionTools** — Knowledge base search, artifact creation, memo writing, approval requests
- **MCP Server** — Exposes Crost's capabilities to external agents via Model Context Protocol
- **Full GCP deployment** — Cloud Run + Cloud SQL + Cloud Storage + Firebase Auth

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full diagram.

```
Founder → POST /api/adk → ADK Runner
  → OrcAgent (Gemini 2.5 Flash)
    → search_knowledge_base (FunctionTool → Cloud SQL)
    → read_company_memo (FunctionTool → Cloud SQL)
    → plan: 3-5 tasks
    → transfer to DepartmentAgent
      → execute task
      → create_artifact (FunctionTool → Cloud Storage)
      → request_human_approval (FunctionTool → Cloud SQL)
      → write_to_memo (FunctionTool → Cloud SQL)
    → return to OrcAgent
  → synthesize mission report
  → update_goal_status (complete)
  → SSE stream → Founder browser
```

---

## Tech Stack (All Google Cloud)

| Component | Google Service |
|-----------|---------------|
| Agent Framework | **Google ADK v1.2.0** (`@google/adk`) |
| LLM | **Vertex AI Gemini 2.5 Flash** |
| Compute | **Cloud Run** (containerized Next.js) |
| Database | **Cloud SQL PostgreSQL 15** |
| File Storage | **Cloud Storage** (artifacts + KB) |
| Auth | **Firebase Authentication** |
| Secrets | **Secret Manager** |
| Cron | **Cloud Scheduler** |
| CI/CD | **Cloud Build** |

---

## Key ADK Features Used

1. **`LlmAgent`** — OrcAgent + all DepartmentAgents
2. **`FunctionTool`** with Zod schema validation — 7 tools
3. **`Runner`** — Orchestrates agent execution
4. **`InMemorySessionService`** — Session management (→ DatabaseSessionService in production)
5. **`GcsArtifactService`** — Cloud Storage artifact management
6. **`subAgents`** — Orc delegates to departments via ADK's agent transfer mechanism
7. **Streaming via `runAsync()`** — Events streamed to founder in real time

---

## MCP Server

Crost exposes itself as an MCP server at `/api/mcp`:

```
GET /api/mcp → lists 5 Crost tools
POST /api/mcp (method: "tools/call") → executes tools
```

External agents (Claude Desktop, custom ADK agents) can:
- `crost_run_goal` — delegate work to Crost
- `crost_search_knowledge` — query company KB
- `crost_list_departments` — discover available agents
- `crost_get_memos` — read company state
- `crost_get_goal_status` — track execution

---

## Human-in-the-Loop

Every external action requires founder approval:

1. Department agent calls `request_human_approval` tool
2. Approval request written to Cloud SQL
3. Founder sees request in `/dashboard/approvals`
4. Founder approves/rejects
5. Agent proceeds only after approval

**No agent takes external action autonomously.**

---

## Native Google Tool Execution (no third-party broker)

Approved actions execute against the founder's own Google account via native OAuth — **no Composio or third-party tool broker**:

- **Google OAuth 2.0** (offline / refresh tokens) grants `gmail.send`, `gmail.readonly`, `calendar.events`
- On approval, Crost calls the **Gmail API** directly (`users.messages.send`) to send real email in the founder's voice
- Tokens are stored in Cloud SQL and **auto-refreshed**; the same grant powers Calendar and future Gmail push-event listening

This keeps the entire stack on Google infrastructure end to end.

---

## Live Demo

- **Demo page:** `https://crost-frontend-3ge3tx36sa-uc.a.run.app/demo`
- **ADK API:** `GET https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/adk`
- **MCP Server:** `GET https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/mcp`
- **Health:** `https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/health`

---

## Code

**GitHub:** https://github.com/joyadeniran/Crost (or local repo)

**Key files:**
- `frontend/lib/adk/agents.ts` — ADK agent definitions
- `frontend/lib/adk/tools.ts` — ADK FunctionTool implementations
- `frontend/lib/adk/runner.ts` — ADK Runner setup
- `frontend/app/api/adk/route.ts` — ADK execution endpoint
- `frontend/app/api/mcp/route.ts` — MCP server
- `frontend/app/demo/page.tsx` — Live demo page
- `ARCHITECTURE.md` — Architecture diagram
- `cloudsql_migration.sql` — Complete Cloud SQL schema
- `cloudbuild.yaml` — Cloud Build CI/CD

---

## Testing Access

1. Visit `https://app.crosthq.com/demo`
2. Try a goal: *"Write a competitive analysis of our top 3 competitors"*
3. Watch Orc + Department agents execute in real time
4. See artifacts, memos, and approval requests created

Or call the API directly:
```bash
curl https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/adk
# Returns ADK capabilities

curl https://crost-frontend-3ge3tx36sa-uc.a.run.app/api/mcp
# Returns MCP tools list
```

---

*Built with $500 Google Cloud credits for the Google for Startups AI Agents Challenge.*
*Submission deadline: June 11, 2026.*
