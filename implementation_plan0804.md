# Implement Crost MCP & Tools System v1

The goal is to implement a lightweight, Onyx-free Model Context Protocol (MCP) tool execution layer. This allows worker departments to safely execute external actions (e.g., fetching data, saving documents, mocking WhatsApp/Emails) through a controlled Edge Function execution engine.

## User Review Required

> [!IMPORTANT]  
> Are we hosting the execution engine explicitly on a **Supabase Edge Function** via Deno for this MVP, or should we implement it as a standard **Next.js API Route / Server Action** first for faster iteration, given the `runWorkerTask` is already running within the Next.js Node environment?  
> *Note: For immediate MVP testing without deploying Edge Functions, a Next.js API route (`/api/tools/execute`) is identical in architecture but easier to test locally.*

## Proposed Changes

---

### Frontend / API Layer (Execution Engine)

#### [NEW] `frontend/app/api/tools/execute/route.ts`
- Implement the central Tool Registry and Dispatcher.
- Contains the MVP tools:
  - `get_sales_data(range)`: Returns placeholder JSON data for sales.
  - `get_customer_list(segment)`: Returns placeholder JSON array of customers.
  - `send_whatsapp_message(to, message)`: Mock implementation (returns simulated success).
  - `save_document(title, content)`: Saves actual generated outputs (can tie into the existing Artifacts DB).
- Flow: Receives `{ tool: string, params: object, ...context }`, validates, runs the tool logic, and returns `{ success, data, error }`.

---

### Onyx Interface (Worker Loop)

#### [MODIFY] `frontend/lib/onyx-client.ts`
- **Schema Update**: Update the strict JSON output schema in `runWorkerTask` to allow a `tool_request` object constraint:
  ```json
  "tool_request": {
    "tool": "Name of tool (optional)",
    "params": { ... }
  }
  ```
- **Prompt Addition**: Append the exact MCP instructions to the worker's Context Block telling departments to use `tool_request` if external action is required, and explicitly command them *not* to hallucinate the data themselves.
- **Execution Loop**: Intercept the `workerResult`. If `tool_request` is present:
  1. Halt standard completion.
  2. Call the `/api/tools/execute` Engine with the request.
  3. Store the result strictly as a `company_memos` record representing the tool output.
  4. Log `tool_executed` to `event_log`.
  5. Mark the initial `goal_tasks` state completed (the Orchestrator inherently utilizes the saved memo for the next steps).

---

## Open Questions

> [!WARNING]  
> If an agent requests a tool, does the task mark itself as `completed` immediately after simply dispatching the Edge Function, or should it await the Edge Function's API response to log the execution success before completing? (I am planning on *awaiting* the API response to guarantee execution safety).

## Verification Plan

### Automated Tests
- Run `npm run dev` and dispatch a worker task that relies on data (e.g., an Ops task querying "Sales Data"). 
- Monitor the network and node console to verify the LLM outputs `"tool": "get_sales_data"`.

### Manual Verification
- Check the `company_memos` table to verify that the executed Tool Engine successfully populated the result.
- Check `event_log` for the new `tool_executed` event type.
