This `.md` file is designed for your "Builder Agent" or developer. It provides the exact structural logic to replace the Nango setup with **Composio**, focusing on **Next.js Route Handlers (Node.js runtime)** and **Supabase integration**.

---

### **📄 CROST_COMPOSIO_INTEGRATION.md**

# Crost Implementation: Composio Tool Execution Layer

## 1. Overview
We are pivoting from Nango to **Composio** to handle external tool execution (Gmail, GitHub, etc.). Composio provides managed OAuth, pre-built tool schemas, and an SDK that allows our AI Workers to execute real-world actions safely through the Crost "Approval Gate."

## 2. Prerequisites
- **API Key:** `COMPOSIO_API_KEY` added to `.env.local`.
- **SDK:** `npm install @composio/core`
- **Dashboard:** Enable "Gmail" and "GitHub" toolsets in the Composio console.

## 3. Core Architecture: The "Entity" Strategy
In Crost, every **User** is a Composio **Entity**. 
- We use the `user_id` (from Supabase) as the `entityId`.
- This ensures the "Sales Department" uses the specific Gmail account connected by that founder.

## 4. Implementation Steps

### A. Managed Auth (The "Connect" Button)
Instead of a popup, we generate a **Connect Link**.
**Route:** `app/api/connect/route.ts`
```typescript
import { Composio } from "@composio/core";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { userId, provider } = await req.json(); // e.g., 'gmail'
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
  
  try {
    const entity = composio.client.getEntity(userId);
    const connection = await entity.initiateConnection(provider);
    
    // Return the redirect URL to the frontend
    return NextResponse.json({ url: connection.redirectUrl });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create connection" }, { status: 500 });
  }
}
```

### B. Tool Execution (The "Hands")
This is the main dispatcher for our workers. It only runs if the Crost task is `approved`.
**Route:** `app/api/worker/execute/route.ts`
```typescript
import { Composio } from "@composio/core";
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // Use service role to check approval

export async function POST(req: Request) {
  const { taskId, userId, toolName, args } = await req.json();
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

  // 1. GATEKEEPER: Verify task is approved in Supabase
  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('status, goal_id')
    .eq('id', taskId)
    .single();

  if (task?.status !== 'approved') {
    return new Response("Unauthorized: Task requires founder approval.", { status: 403 });
  }

  try {
    // 2. EXECUTE via Composio Entity
    const entity = composio.client.getEntity(userId);
    const result = await entity.executeTool(toolName, args);

    // 3. PERSIST: Save result to Memos for Orchestrator synthesis
    await supabaseAdmin.from('memos').insert({
      goal_id: task.goal_id,
      task_id: taskId,
      content: result,
      type: 'tool_output'
    });

    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
}
```


## 5. Worker System Prompt (JSON Contract)
Update the Worker Agent system prompts to include this instruction:
> "To interact with external tools, you must return a JSON object with the key `tool_call`. 
> Format: `{"tool_call": "GMAIL_SEARCH_EMAILS", "args": {"q": "from:leads@example.com"}}`.
> Do not simulate the output. The system will provide the real data in the next turn via a Memo."

## 7. Next Phase: Discovery
Once Gmail is connected, the Builder should implement the `entity.getTools()` endpoint to allow the **Orc** to dynamically see which capabilities the founder has unlocked.

---

### **What this solves for the Builder:**
1. **Unauthenticated Errors:** Removed by using Composio’s managed auth links.
2. **Infrastructure:** No need to manage OAuth tokens or refresh logic; Composio handles it.
3. **Safety:** The `taskId` check ensures the AI can never "fire off" a tool unless the Founder has flipped the status to `approved`.

**Ready to hand this to the agent? This will transform Crost from a "Chatbot" into a "Worker" immediately.**