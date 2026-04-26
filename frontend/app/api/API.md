# Crost Internal API Reference

All routes are under `/api/`. Auth is via Supabase session cookie (SSR). All timestamps are ISO 8601.

**Maintenance rule**: When you add, remove, or change a route's request/response shape, update this file in the same commit.

---

## Goals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/goals` | List all goals, newest first |
| POST | `/api/goals` | Create goal + trigger orchestrator |
| GET | `/api/goals/[id]` | Fetch goal with tasks |
| PATCH | `/api/goals/[id]` | Update goal status/outcome |
| POST | `/api/goals/[id]/dispatch` | Dispatch approved task to worker |
| POST | `/api/goals/[id]/dialogue` | Append founder message and re-trigger planning |
| POST | `/api/goals/[id]/report` | Trigger orchestrator synthesis for final report |
| PATCH | `/api/goals/[id]/tasks/[taskId]` | Manually set task status |

### POST /api/goals
```
body:     { founder_input: string (5–2000 chars) }
response: { success: boolean, data: Goal, timestamp: string }
```

### PATCH /api/goals/[id]
```
body:     { status?: 'pending'|'planning'|'awaiting_approval'|'executing'|'completed'|'failed'|'cancelled', outcome?: string }
response: { success: boolean, data: Goal, timestamp: string }
```

### POST /api/goals/[id]/dispatch
```
body:     { task_id: string, task_override?: { label?: string, reasoning?: string, params?: Record<string, unknown> } }
response: { success: boolean, data: { dispatched: boolean, dept: string, task_id: string, goal_id: string }, timestamp: string }
```

### POST /api/goals/[id]/dialogue
```
body:     { message?: string, force_plan?: boolean }
response: { success: boolean, timestamp: string }
```

### PATCH /api/goals/[id]/tasks/[taskId]
```
body:     { status: 'rejected'|'completed' }
response: { success: boolean }
```

---

## Departments

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/departments` | List departments |
| POST | `/api/departments` | Create department or clone template |
| GET | `/api/departments/[slug]` | Fetch department details |
| PATCH | `/api/departments/[slug]` | Update department settings |
| DELETE | `/api/departments/[slug]` | Soft deprecate or hard delete |
| POST | `/api/departments/[slug]/activate` | Promote activation stage |
| POST | `/api/departments/[slug]/reset` | Force-reset stuck department |
| POST | `/api/departments/[slug]/task` | Dispatch task to department persona |
| POST | `/api/departments/resync` | Standardise all active departments to Direct LLM |

### GET /api/departments
```
query:    ?scope=default|user|all|templates  &active_only=boolean  &include_orchestrator=boolean
response: { data: Department[] }
```

### POST /api/departments
```
body (create): { name, slug, persona_prompt, model_provider: enum, model_name, tools?: string[], capabilities?: string[], restrictions?: string[], tone_override?: string, icon?: string, color?: hex }
body (clone):  { template_slug: string }
response: { success: boolean, data: Department }  [201]
```

### PATCH /api/departments/[slug]
```
body:     { persona_prompt?, tone_override?, capabilities?, restrictions?, model_provider?, model_name?, tools?, icon?, color?, reset_to_template?: boolean }
response: { data: Department }
```

### DELETE /api/departments/[slug]
```
query:    ?hard=boolean
response: { success: boolean, data: { deprecated?: boolean, deleted?: boolean } }
```

### POST /api/departments/[slug]/task
```
body:     { task: string (1–4000 chars), session_id?: string }
response: { answer: string, approval_requested: boolean, approval_id?: string, artifact_id?: string, goal_id?: string }
```

### POST /api/departments/resync
```
response: { success: boolean, synced: number, total_active: number, results: Array }
```

---

## Artifacts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/artifacts` | List artifacts |
| POST | `/api/artifacts` | Create artifact metadata |
| DELETE | `/api/artifacts/[id]` | Delete artifact and file |

### GET /api/artifacts
```
query:    ?type=string  &department=string  &goal=string
response: { success: boolean, data: Artifact[], timestamp: string }
```

### POST /api/artifacts
```
body:     { goal_id?: uuid, department_id?: uuid, department_slug: string, artifact_type: enum, title: string, file_url: url, metadata?: object, preview_url?: url, skills_used?: string[], sources?: { memo_ids?: uuid[], kb_file_ids?: uuid[], tool_calls?: unknown[] } }
response: { success: boolean, data: Artifact, timestamp: string }  [201]
```

---

## Approvals (HITL)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/approvals` | List approvals |
| POST | `/api/approvals` | Create approval request |
| GET | `/api/approvals/[id]` | Fetch approval details |
| PATCH | `/api/approvals/[id]` | Approve or reject |
| POST | `/api/approvals/expire` | Mark 24h+ old approvals as expired (cron) |

### GET /api/approvals
```
query:    ?status=pending|all  &department=string
response: { data: Approval[] }
```

### POST /api/approvals
```
body:     { department_id: uuid, department_name, department_slug, action_type: enum, action_label, payload: object, context?: string, risk_level?: enum }
response: { data: Approval }  [201]
```

### PATCH /api/approvals/[id]
```
body:     { decision: 'approved'|'rejected', decided_by?: string }
response: { data: Approval, execution_status?: string, execution_error?: string }
```

### POST /api/approvals/expire
```
header:   x-cron-secret (optional)
response: { success: boolean, expired: number, expiredIds: string[] }
```

---

## Suggested Actions

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/suggested-actions/[id]/execute` | Execute suggested action by row ID |
| POST | `/api/suggested-actions/execute` | Execute action by action_id |

### POST /api/suggested-actions/[id]/execute
```
body:     { inputs?: Record<string, string> }
response: { success: boolean, result: unknown }
```

### POST /api/suggested-actions/execute
```
body:     { action_id: string, goal_id?: string }
response: { success: boolean, result: unknown }
```

---

## Tools

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/tools` | List all tools from registry |
| POST | `/api/tools/execute` | Execute internal/integrated tool |
| POST | `/api/tools/invoke` | Direct tool invocation from Orc chat |

### POST /api/tools/execute
```
body:     { tool: string, params?: object, goal_id?: string, task_id?: string, department_slug?: string, department_id?: string }
response: { success: boolean, data: unknown }
```

### POST /api/tools/invoke
```
body:     { service: string, action: string, params?: object, goal_id?: string, task_id?: string, risk?: string }
response: { success: boolean, result: unknown, artifact_id?: string }
```

---

## Knowledge Base

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/knowledge/files` | List KB files |
| DELETE | `/api/knowledge/files` | Delete KB file |
| POST | `/api/knowledge/search` | Semantic search over KB |
| POST | `/api/knowledge/upload` | Upload and process file |

### GET /api/knowledge/files
```
query:    ?query=string  &category=string  &limit=number
response: { files: KBFile[] }
```

### DELETE /api/knowledge/files
```
query:    ?id=uuid
response: { success: boolean }
```

### POST /api/knowledge/search
```
body:     { userId: string, query: string, category?: string, fileType?: string, limit?: number, artifact_id?: string }
response: { matches: Array<{ title, summary, chunk, category, relevance }> }
```

### POST /api/knowledge/upload
```
body:     FormData — file: File, title?: string, category?: string, description?: string
response: { success: boolean, fileId: string, file_url: string, processing_status: string }
```

---

## Memos

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/memos` | List memos |
| POST | `/api/memos` | Create memo |

### GET /api/memos
```
query:    ?tag=string  &department=string  &priority=enum
response: { data: Memo[] }
```

### POST /api/memos
```
body:     { from_department: string, from_department_id?: uuid, title, body, tags?: string[], priority?: enum }
response: { data: Memo }  [201]
```

---

## Config & System

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/config` | Update system config value |
| GET | `/api/config/secret-presence` | Check which API keys are set (no values exposed) |
| GET | `/api/toggle` | Get current env mode |
| POST | `/api/toggle` | Toggle env mode (Cloud-only) |
| GET | `/api/usage/today` | Daily token usage |
| GET | `/api/health` | Service health check |

### PATCH /api/config
```
body:     { key: string, value: unknown }
response: { data: ConfigItem }
```

### GET /api/config/secret-presence
```
response: { presence: Record<string, boolean> }
```

### GET /api/usage/today
```
response: { tokensUsed: number, limit: number, resetAt: string, hasUserKey: boolean }
```

### GET /api/health
```
response: { status: 'healthy'|'unhealthy', timestamp: string, services: { supabase: string, litellm: string }, details: Record<string, string|null> }
```

---

## Connections (Composio)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/connect` | Initialise Composio OAuth connection |
| GET | `/api/connect/sync` | Sync Composio connection status |

### POST /api/connect
```
body:     { userId: string, provider: string }
response: { url: string }
```

### GET /api/connect/sync
```
response: { success: boolean, tools: Tool[], timestamp: string }
```

---

## Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings/models` | List API keys and model assignments |
| POST | `/api/settings/models` | Assign model to role |
| POST | `/api/settings/models/validate` | Validate and store API key |
| GET | `/api/settings/tools` | List configured tools |
| POST | `/api/settings/tools/connect` | Save tool connection |
| POST | `/api/settings/tools/config` | Configure tool settings |

### POST /api/settings/models
```
body:     { role: string, model_name: string, provider: string, preset_config?: unknown }
response: { success: boolean }
```

### POST /api/settings/models/validate
```
body:     { provider: string, api_key: string }
response: { valid: boolean, success: boolean }
```

### POST /api/settings/tools/connect
```
body:     { service_name: string, connection_id: string }
response: { success: boolean }
```

### POST /api/settings/tools/config
```
body:     { id: string, config?: unknown, is_configured?: boolean }
response: { success: boolean }
```

---

## Onboarding

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/onboarding/interpret-business` | LLM categorise business description |
| POST | `/api/onboarding/set-step` | Update onboarding progress |
| POST | `/api/onboarding/first-goal` | Create founder's first goal |
| POST | `/api/onboarding/complete` | Mark onboarding complete with identity |
| POST | `/api/onboarding/complete-final` | Final onboarding step |

### POST /api/onboarding/interpret-business
```
body:     { description: string }
response: { category: string, confidence: 'low'|'high', error?: string }
```

### POST /api/onboarding/set-step
```
body:     { step: 'identity'|'control'|'orc'|'team'|'activated'|'complete' }
response: { success: boolean }
```

### POST /api/onboarding/first-goal
```
body:     { goal: string }
response: { goal_id: string, plan: unknown }
```

### POST /api/onboarding/complete
```
body:     { identity: { founderName?, companyName?, ... }, riskTolerance?: string, selectedDepartments?: string[], termsVersion?: string, privacyVersion?: string }
response: { success: boolean }
```

---

## Auth & Worker

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/logout` | Sign out user |
| POST | `/api/worker/execute` | Execute task with tool calls (internal) |

### POST /api/worker/execute
```
body:     { taskId: string, goalId: string, userId: string, toolName: string, args: Record<string, unknown> }
response: { data: unknown, _metadata?: { stored: string } }
```
