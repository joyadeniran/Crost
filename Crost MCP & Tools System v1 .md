# Crost MCP & Tools System (v1 – Onyx-Free)

---

# 1. Core Principle

We are not rebuilding Onyx.

We are building:

> **A lightweight, controllable tool execution layer that allows departments to act on real-world systems safely.**

---

# 2. What is MCP in Crost?

MCP (Model Context Protocol) in Crost =

> **A structured way for workers to request actions (“tools”) and receive results.**

---

## Key Idea

Workers do NOT:

* call APIs directly
* execute actions autonomously

Instead:

```text
Worker → Tool Request → Execution Engine → Tool → Response → Memo
```

---

# 3. System Overview

```text
Orc
 ↓
Plan (tasks)
 ↓
Worker
 ↓
Tool Request (JSON)
 ↓
Execution Engine (Edge Function)
 ↓
External Tool (API / DB / Service)
 ↓
Result
 ↓
Memo
```

---

# 4. Tool Interface (Standard Contract)

Every tool must follow this structure:

## Tool Request (from Worker)

```json
{
  "tool": "tool_name",
  "params": {
    "key": "value"
  }
}
```

---

## Tool Response

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

---

# 5. Initial Tool Set (MVP)

Start SMALL. Only implement what is needed for real workflows.

---

## 5.1 Data Tools (Internal)

### get_sales_data

```json
{
  "tool": "get_sales_data",
  "params": {
    "range": "30d"
  }
}
```

---

### get_customer_list

```json
{
  "tool": "get_customer_list",
  "params": {
    "segment": "active"
  }
}
```

---

## 5.2 Communication Tools (Mock First)

### send_whatsapp_message (mocked)

```json
{
  "tool": "send_whatsapp_message",
  "params": {
    "to": "+234...",
    "message": "..."
  }
}
```

⚠️ For MVP:

* DO NOT actually send
* Return simulated success

---

### send_email (mocked)

---

## 5.3 Content Tools

### save_document

Stores generated outputs

```json
{
  "tool": "save_document",
  "params": {
    "title": "...",
    "content": "..."
  }
}
```

---

# 6. Execution Engine (CRITICAL)

This replaces Onyx “sandbox”.

---

## Implementation

Use:

* Supabase Edge Functions

---

## Flow

```text
1. Task approved
2. Worker runs
3. Worker outputs tool request
4. Edge Function receives request
5. Executes tool
6. Saves result as memo
```

---

## Example (pseudo-code)

```ts
if (task.is_approved) {
  const toolRequest = workerOutput.tool;

  const result = await runTool(toolRequest);

  await saveMemo({
    goal_id,
    task_id,
    content: result
  });
}
```

---

# 7. Tool Registry

Create a central registry:

```ts
const TOOLS = {
  get_sales_data,
  get_customer_list,
  send_whatsapp_message,
  save_document
};
```

---

## Dispatcher

```ts
function runTool({ tool, params }) {
  const fn = TOOLS[tool];
  if (!fn) throw new Error("Tool not found");

  return fn(params);
}
```

---

# 8. Approval Gating (NON-NEGOTIABLE)

No tool runs without approval.

---

## Rule

```ts
if (!task.is_approved) {
  throw new Error("Execution blocked");
}
```

---

## Future

Add:

* per-tool permissions
* risk levels

---

# 9. Department Tool Usage

Each department uses tools differently:

---

## Sales

* get_customer_list
* send_whatsapp_message

---

## Marketing

* save_document
* generate_campaign_copy (LLM only)

---

## Operations

* get_sales_data
* update_inventory (future)

---

## Finance (later)

* read_transactions
* generate_reports

---

# 10. MCP + Worker Integration

Workers must be PROMPTED to think in tools.

---

## Prompt Addition

```text
If external data or action is required,
return a tool request in JSON format.

Do NOT simulate tool results.
```

---

# 11. Activity Feed Integration

Every tool execution should emit:

```json
{
  "event": "tool_executed",
  "tool": "get_sales_data",
  "status": "success"
}
```

---

# 12. What We Are NOT Building (Yet)

❌ No OAuth integrations
❌ No live WhatsApp/email sending
❌ No complex connector marketplace
❌ No sandboxed code execution

---

# 13. Future Expansion (Post-MVP)

Once stable:

* Real integrations (WhatsApp, Gmail, Stripe)
* Tool permission system
* Tool audit logs
* Retry + failure handling
* Async job queues

---

# 14. MVP Success Criteria

The system works if:

1. Worker requests a tool
2. Tool executes via Edge Function
3. Result is stored as memo
4. Orc can use that result

---

# 15. Final Principle

We are not building “integrations”.

We are building:

> **A controlled execution layer that turns AI decisions into real-world actions safely.**

---

# End
