import { Composio } from "@composio/core";
import { createServerSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { cleanLargePayload } from "@/lib/utils";

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { taskId, goalId, userId, toolName, args } = await req.json();
    
    if (!taskId || !goalId) {
      return NextResponse.json({ error: "taskId and goalId are required" }, { status: 400 });
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "COMPOSIO_API_KEY is not set" }, { status: 500 });
    }

    const supabase = createServerSupabaseClient();

    // 1. GATEKEEPER: Verify task is approved and belongs to the user
    const { data: task, error: taskError } = await supabase
      .from('goal_tasks')
      .select('status, goal_id, dept_slug, created_by')
      .eq('task_id', taskId)
      .eq('goal_id', goalId)
      .single();

    if (taskError || !task) {
      console.error(`[Worker Execute] Task not found for ID: ${taskId}`, taskError);
      return NextResponse.json({ 
        error: "Task not found",
        details: taskError?.message
      }, { status: 404 });
    }

    // Ownership check: allow null created_by for legacy rows (pre-migration tasks)
    if (task.created_by !== null && task.created_by !== userId) {
      console.warn(`[Worker Execute] Ownership mismatch for task ${taskId}: expected ${userId}, got ${task.created_by}`);
      return NextResponse.json({ error: "Unauthorized: Task owner mismatch." }, { status: 403 });
    }

    // Status check: tool calls come from inside a running worker, so task is 'dispatched'
    const executableStatuses = ['approved', 'running', 'pending', 'planned'];
    if (!executableStatuses.includes(task.status)) {
      console.warn(`[Worker Execute] Task ${taskId} is in non-executable status: ${task.status}`);
      return NextResponse.json({ error: `Task is not in an executable state (status: ${task.status}).` }, { status: 403 });
    }

    // 2. LOCAL TOOL ROUTER (Intercept internal capabilities)
    let result;
    const normalizedToolName = toolName.toUpperCase();

    if (normalizedToolName === 'COMPANY_MEMOS') {
      const { data: memos, error: memoErr } = await supabase
        .from('company_memos')
        .select('title, body, priority, from_department, created_at')
        .eq('goal_id', task.goal_id)
        .order('created_at', { ascending: false })
        .limit(args.limit || 10);
      
      if (memoErr) throw memoErr;
      result = memos;
    } 
    else if (normalizedToolName === 'SUPABASE_QUERY') {
      let sql = (args.query || "").trim();
      if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();
      
      if (!sql || sql === "") throw new Error("Missing or empty 'query' argument for SUPABASE_QUERY");

      // Strict read-only check (very basic naive safety)
      const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
      if (forbidden.some(word => sql.toUpperCase().includes(word))) {
        throw new Error("Unauthorized: SUPABASE_QUERY is restricted to SELECT operations only.");
      }

      const { data, error: sqlErr } = await supabase.rpc('read_only_query', { query_text: sql });
      if (sqlErr) {
        console.error(`[SUPABASE_QUERY Error]: ${sqlErr.message} | SQL: ${sql}`);
        
        // HALLUCINATION GUARD: If relation doesn't exist, signal "needs_data" to loop
        if (sqlErr.message.includes('does not exist') || sqlErr.message.includes('column') || sqlErr.message.includes('relation')) {
          return NextResponse.json({
            needs_more_data: true,
            missing_data: [`Valid Database Schema for: ${sql}`],
            error: sqlErr.message,
            suggested_action: "Hallucination detected. Verify the table/column names in the actual database schema."
          }, { status: 200 }); // Return 200 so the loop parses it as a 'needs_data' signal
        }
        throw sqlErr;
      }
      result = data;
    }
    else {
      // 3. EXTERNAL DYNAMIC TOOLS (via Composio)
      if (!process.env.COMPOSIO_API_KEY) throw new Error("COMPOSIO_API_KEY missing.");
      const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
      
      try {
        // Correct SDK method for Composio v2 is tools.execute
        const execution = await composio.tools.execute(toolName, {
          userId,
          arguments: args,
          dangerouslySkipVersionCheck: true
        });
        result = execution;
      } catch (err: any) {
        if (err.message?.includes('401') || err.message?.includes('Unauthorized') || err.status === 401) {
          console.warn(`[Composio] Token potentially expired (401). Retrying...`);
          const execution = await composio.tools.execute(toolName, {
            userId,
            arguments: args,
            dangerouslySkipVersionCheck: true
          });
          result = execution;
        } else {
          throw err;
        }
      }
    }

    // 4. PERSIST: Save result to company_memos for Orchestrator synthesis
    let bodyText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    const fullBodyText = bodyText;
    // Prune for egress safety
    if (bodyText.length > 3000) {
      bodyText = bodyText.substring(0, 3000) + '\n\n... [Output truncated for egress efficiency]';
    }

    let artifactReference: string | null = null;
    if (fullBodyText.length > 1200) {
      const { data: artifact } = await supabase.from('artifacts').insert({
        goal_id: task.goal_id,
        department_slug: task.dept_slug,
        artifact_type: 'document',
        title: `Tool Output: ${toolName}`,
        body: fullBodyText,
        metadata: { toolName, taskId, source: 'tool_execution' },
        created_by: userId,
        sources: { memo_ids: [], kb_file_ids: [], tool_calls: [{ tool: toolName, executed_at: new Date().toISOString() }] },
      }).select('id').single();

      artifactReference = artifact?.id ?? null;
    }

    await supabase.from('company_memos').insert({
      from_department: task.dept_slug,
      goal_id: task.goal_id,
      title: `Tool Output: ${toolName}`,
      body: artifactReference
        ? `${bodyText}\n\nReadable artifact saved in Artifacts with ID: ${artifactReference}`
        : bodyText,
      tags: ['tool_output', `task_${taskId}`],
      priority: 'normal',
      source_type: 'agent',
      created_by: userId
    });

    // 5. Update Event Log
    await supabase.from('event_log').insert({
      department_slug: task.dept_slug,
      goal_id: task.goal_id,
      event_type: 'tool_called',
      description: `Executed tool: ${toolName}`,
      metadata: cleanLargePayload({ toolName, args, taskId, result: typeof result === 'object' ? { status: 'success' } : result }),
      created_by: userId
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("[Worker Execute Error]:", error);
    return NextResponse.json({ error: error.message || "Execution failed" }, { status: 500 });
  }
}
