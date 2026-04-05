# Crost — Build Instructions for Claude Code
**Read 01_CROST_MASTER_CONTEXT.md first. Every decision here references it.**

---

## How to Use This Document

This is your step-by-step build guide. Each phase has explicit success criteria. Do not move to the next phase until the current phase passes its checks. If something contradicts the master context document, the master context wins.

---

## Phase 1 — The Engine

**Goal:** Running infrastructure. Every service reachable. Database seeded.

### 1.1 Clone and configure
```bash
# Clone Onyx as a git submodule
git submodule add https://github.com/onyx-dot-app/onyx.git onyx
git submodule update --init --recursive

# Copy env file
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# Leave LLM keys blank for now — BYOK means founders provide these at onboarding
```

### 1.2 Start Docker
```bash
# Use the lite profile (dev only — no GPU, minimal services)
docker compose --profile onyx-lite up -d

# Verify Onyx is reachable
curl http://localhost:8080/health
```

### 1.3 Pull Ollama models
```bash
# Default — pull this first
ollama pull gemma3:12b

# Engineering/tool-calling fallback
ollama pull llama3:8b

# Emergency fallback
ollama pull mistral

# Verify
ollama list
```

### 1.4 Verify LiteLLM proxy
```bash
# Test local route
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "local/gemma3:12b", "messages": [{"role": "user", "content": "ping"}]}'

# Test cloud route (requires API key in .env)
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "cloud/gemini-pro", "messages": [{"role": "user", "content": "ping"}]}'
```

### 1.5 Run database migrations
```bash
# Run in order — sequence matters
supabase db push

# Or manually in Supabase SQL editor, in this order:
# 1. departments
# 2. approval_queue
# 3. company_memos
# 4. event_log
# 5. system_config
# 6. available_tools
# 7. goals (new table for orchestrator — see master context §9)
```

### 1.6 Enable Realtime
In Supabase dashboard, enable Realtime on:
- departments
- approval_queue
- event_log
- goals

### 1.7 Seed the database
```bash
pnpm run seed
# This creates: 3 worker departments (sales, marketing, ops) + orchestrator department
# Verifies: system_config has local_identity placeholder, env_mode = "local"
# Verifies: available_tools has supabase_query, gmail_draft, web_search
```

### Phase 1 success criteria
- [ ] `curl localhost:8080/health` returns 200
- [ ] `ollama list` shows gemma3:12b
- [ ] LiteLLM local route returns a completion
- [ ] All 7 migrations applied, no errors
- [ ] Supabase Realtime enabled on 4 tables
- [ ] Seed script completes, 4 departments visible in dashboard (3 workers + orchestrator)
- [ ] `system_config` has `env_mode`, `local_identity`, `agent_constitution` rows

---

## Phase 2 — The Brain + Tone

**Goal:** Orchestrator persona created in Onyx, outputs valid JSON, local identity injected.

### 2.1 Create the Orchestrator Onyx persona
Use the Onyx API to create a persona with:
- Name: "Orchestrator"
- System prompt: see `03_PROMPTS_AND_CONTRACTS.md` → Orchestrator System Prompt
- Corpus subscriptions: company_memos
- Tools: none (orchestrator does not execute tools directly)
- Model: resolves from env_mode via LiteLLM

```typescript
// In frontend/lib/onyx-client.ts
const orchestratorPersona = await createOnyxPersona({
  name: 'Orchestrator',
  description: 'Goal decomposition and department coordination',
  system_prompt: buildOrchestratorPrompt(localIdentity),
  is_orchestrator: true,
  model: 'cloud/gemini-pro' // default, overridable
})

// Store persona ID
await supabase
  .from('system_config')
  .upsert({ key: 'orchestrator_persona_id', value: orchestratorPersona.id })
```

### 2.2 Wire local identity injection
`buildFinalPrompt()` must inject `local_identity` at position 3 (after persona prompt, before capability bounds).

```typescript
async function buildFinalPrompt(dept: Department, task: string): Promise<string> {
  const [constitution, localIdentity, memoBrief] = await Promise.all([
    getConstitution(dept.is_orchestrator),
    getLocalIdentity(),         // system_config key: local_identity
    getMemoBrief(dept.slug),
  ])

  return [
    constitution,
    dept.persona_prompt,
    formatLocalIdentity(localIdentity),  // position 3 — not optional, not last
    formatCapabilities(dept.capabilities, dept.restrictions),
    memoBrief,
    task,
  ].filter(Boolean).join('\n\n---\n\n')
}
```

### 2.3 Test orchestrator output
Send a test goal and verify the response matches the JSON schema exactly:

```typescript
const testGoal = "Prepare Supplya for a December sales push"
const response = await runOrchestratorTask(testGoal)

// Must pass all of these
assert(response.goal === testGoal)
assert(typeof response.risk_note === 'string' && response.risk_note.length > 0)
assert(Array.isArray(response.tasks) && response.tasks.length > 0)
response.tasks.forEach(task => {
  assert(['sales','marketing','ops'].includes(task.dept))
  assert(['low','medium','high','critical'].includes(task.risk_level))
  assert(typeof task.reasoning === 'string' && task.reasoning.length > 0)
})
```

### 2.4 Verify tone
Ask the orchestrator to plan for a Lagos-based B2B business. The plan's language should feel contextually relevant — not generic US startup language.

### Phase 2 success criteria
- [ ] Orchestrator persona created in Onyx, ID stored in system_config
- [ ] `buildFinalPrompt()` injects local_identity at position 3
- [ ] Test goal returns valid JSON matching schema in master context §6
- [ ] `risk_note` is always populated — never null or empty
- [ ] `reasoning` populated on every task — never null
- [ ] Tone reflects the local identity configured in system_config

---

## Phase 3 — The 3 Workers

**Goal:** Sales, Marketing, Ops personas created in Onyx. Each accepts a typed task object and returns a result.

### 3.1 Create worker personas
For each department (sales, marketing, ops):
```typescript
const persona = await createOnyxPersona({
  name: dept.name,
  system_prompt: buildWorkerPrompt(dept, localIdentity),
  corpus_subscriptions: ['company_memos'],
  tools: dept.tools, // see master context §7
  model: dept.default_model,
})
await supabase
  .from('departments')
  .update({ onyx_persona_id: persona.id, activation_stage: 'active' })
  .eq('slug', dept.slug)
```

### 3.2 Verify tool assignment
```bash
# In Supabase, verify available_tools
SELECT * FROM available_tools WHERE is_configured = true;
# Must return: supabase_query, gmail_draft, web_search

# Verify each worker has correct tool
SELECT slug, capabilities FROM departments WHERE is_orchestrator = false;
# sales → supabase_query only
# marketing → gmail_draft only
# ops → supabase_query + web_search
```

### 3.3 Test each worker with a typed task object
```typescript
// Sales worker test
const salesTask: WorkerTask = {
  id: crypto.randomUUID(),
  action: 'filter_retailers',
  label: 'Filter top 20 retailers in Lagos',
  reasoning: 'Identify high-value targets for the December push',
  params: { city: 'Lagos', limit: 20 },
  risk_level: 'low',
  model: 'local/gemma3:12b'
}
const result = await runWorkerTask('sales', salesTask)
// Must trigger request_approval() before any Supabase query

// Marketing worker test
const marketingTask: WorkerTask = {
  id: crypto.randomUUID(),
  action: 'draft_whatsapp_templates',
  label: 'Draft 3 WhatsApp templates for December campaign',
  reasoning: 'Customer outreach for December sales push',
  params: { count: 3, campaign: 'December push', tone: 'urgent but friendly' },
  risk_level: 'medium',
  model: 'cloud/gemini-pro'
}
const result = await runWorkerTask('marketing', marketingTask)
// Must trigger request_approval() before drafting (medium risk)
```

### 3.4 Verify constitution enforcement
Each worker must refuse to:
- Execute without `request_approval()` for any irreversible action
- Deviate from task params (e.g., if told to filter 20 retailers, it cannot filter 50)
- Fabricate data (if Supabase returns empty, must surface that, not invent records)

### Phase 3 success criteria
- [ ] 3 worker personas created in Onyx, IDs stored in departments table
- [ ] Each worker has correct tool assignment
- [ ] Sales worker queries Supabase with request_approval() for any write operation
- [ ] Marketing worker drafts only — never sends without explicit approval
- [ ] Ops worker queries only — never modifies records
- [ ] All 3 workers refuse to deviate from task params
- [ ] Activity feed shows worker task events in real time

---

## Phase 4 — The Loop (Approval Feed UI)

**Goal:** The full goal → plan → approve → execute loop works end to end.

### 4.1 War Room command bar
```tsx
// Top of dashboard — always visible
<WarRoom>
  <GoalInput
    placeholder="Tell your company what to do..."
    onSubmit={(goal) => dispatchGoal(goal)}
  />
  {activeGoal && <PlanCard plan={activeGoal.orchestrator_plan} />}
</WarRoom>
```

### 4.2 Plan card
Renders the orchestrator's JSON plan as a visual card. Each task shows:
- Department badge (coloured by dept)
- Action label (human-readable)
- Reasoning (always visible — not collapsed)
- Risk level badge
- Approve / Modify / Reject buttons

```tsx
<PlanCard plan={plan}>
  <RiskNote>{plan.risk_note}</RiskNote>
  <ApproveAllButton onClick={approveAll} />
  {plan.tasks.map(task => (
    <TaskApprovalItem key={task.id} task={task}>
      <Button onClick={() => approve(task.id)}>Approve</Button>
      <Button onClick={() => modify(task.id)}>Modify</Button>
      <Button onClick={() => reject(task.id)}>Reject</Button>
    </TaskApprovalItem>
  ))}
</PlanCard>
```

### 4.3 Approval execution
```typescript
async function approveTask(taskId: string) {
  // 1. Update approval_queue status
  await supabase.from('approval_queue')
    .update({ status: 'approved' })
    .eq('id', taskId)

  // 2. Get the worker task object
  const task = await getApprovalTask(taskId)

  // 3. Dispatch to correct worker department
  await runWorkerTask(task.dept, task)

  // 4. Log to event_log
  await logEvent({
    event_type: 'approval_granted',
    department_slug: task.dept,
    metadata: { task_id: taskId, action: task.action }
  })
}
```

### 4.4 Supabase Realtime subscriptions
The approval feed and activity feed must update without page refresh:

```typescript
// In dashboard layout
supabase
  .channel('approval-updates')
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'approval_queue'
  }, handleApprovalUpdate)
  .on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'event_log'
  }, handleEventLogInsert)
  .subscribe()
```

### Phase 4 success criteria
- [ ] Typing a goal triggers orchestrator, plan card appears
- [ ] Plan card shows risk_note prominently
- [ ] Each task shows reasoning (not hidden/collapsed)
- [ ] Approve All approves all tasks and dispatches to workers
- [ ] Per-task approve/reject works independently
- [ ] Approved tasks execute, results appear in memos
- [ ] Rejected tasks log to event_log as approval_rejected
- [ ] Approval feed updates via Realtime without page refresh
- [ ] Held tasks wait without blocking other approved tasks

---

## Phase 5 — The Activity Feed

**Goal:** event_log rendered as a live timeline. The founder sees the company working.

### 5.1 Timeline component
```tsx
<ActivityFeed>
  {events.map(event => (
    <TimelineEvent key={event.id} event={event}>
      <Timestamp>{formatRelative(event.created_at)}</Timestamp>
      <DepartmentBadge dept={event.department_slug} />
      <EventDescription>{formatEventDescription(event)}</EventDescription>
      {event.event_type === 'task_completed' && (
        <MemoLink memo_id={event.metadata.memo_id} />
      )}
    </TimelineEvent>
  ))}
</ActivityFeed>
```

### 5.2 Event descriptions (human-readable)
```typescript
function formatEventDescription(event: EventLog): string {
  const map: Record<string, (e: EventLog) => string> = {
    goal_received: (e) => `Goal received: "${e.metadata.goal}"`,
    plan_drafted: (e) => `Plan drafted — ${e.metadata.task_count} tasks across ${e.metadata.dept_count} departments`,
    plan_approved: (e) => `Plan approved — ${e.metadata.approved_count} tasks dispatched`,
    approval_granted: (e) => `${e.department_slug}: ${e.metadata.action} approved`,
    approval_rejected: (e) => `${e.department_slug}: ${e.metadata.action} rejected`,
    task_started: (e) => `${e.department_slug} started: ${e.metadata.label}`,
    task_completed: (e) => `${e.department_slug} finished: ${e.metadata.label}`,
    mode_switched: (e) => `Mode switched to ${e.metadata.new_mode}`,
  }
  return map[event.event_type]?.(event) ?? event.event_type
}
```

### 5.3 Memo cards
When a worker completes a task and writes a memo, it should appear as a linked card in the activity feed with a preview of the first 2 lines.

### Phase 5 success criteria
- [ ] Activity feed shows all events from the test goal in correct chronological order
- [ ] Events update via Realtime without page refresh
- [ ] Completed task events link to the memo created
- [ ] Mode switch events appear (toggle local ↔ cloud mid-session)
- [ ] Feed shows at most 50 most recent events, with a "Load more" option
- [ ] Department badges use correct accent colours

---

## Full MVP Smoke Test

Run this sequence manually after all 5 phases complete:

```
1. Fresh browser, navigate to localhost:3000
2. Complete onboarding: name, Lagos, "B2B credit for informal retail", MVP stage, Balanced control
3. Select all 3 departments on Screen 3
4. Watch activation progress bars
5. Type in War Room: "Prepare Supplya for a December sales push"
6. Verify: plan card appears with risk_note
7. Verify: 3 tasks visible (Marketing, Sales, Ops), each with reasoning
8. Approve Marketing task only
9. Verify: Marketing worker begins, activity feed updates
10. Verify: 3 WhatsApp drafts appear in company_memos
11. Reject Ops task — verify event_log records rejection
12. Hold Sales task — verify system waits
13. Toggle to local mode (top bar, Cmd+Shift+M)
14. Approve Sales task — verify it runs on Ollama, data doesn't leave machine
15. Verify: activity feed shows mode_switched event
16. Verify: full timeline readable from top to bottom as a coherent story
```

All 16 steps must pass. That is the MVP.

---

## Common Failure Points

**Orchestrator returns prose instead of JSON**
The system prompt is not enforcing JSON output. Add explicit instruction at the end: "You MUST respond with valid JSON only. No prose before or after. No markdown code blocks. Raw JSON only."

**Worker deviates from task params**
The 3rd worker constitution clause is not being respected or not injected. Verify `buildFinalPrompt()` includes the full constitution for workers.

**local_identity not injected**
Check that `buildFinalPrompt()` calls `getLocalIdentity()` and injects it at position 3. Do not cache this value.

**Approval feed not updating in real time**
Check that Realtime is enabled in Supabase for approval_queue. Check that the channel subscription is set up in the dashboard layout, not inside a component that remounts.

**`reasoning` field missing from approval**
The orchestrator system prompt must explicitly require reasoning on every task. Add a validation step in `parseOrchestratorResponse()` that rejects any task without a non-empty reasoning field.
