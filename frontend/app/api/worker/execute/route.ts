// Worker Execute Route — Task Execution with Proper Memo/Artifact Separation
// Per CROST_SPEC Section 5-6:
// - Large outputs (>1200 chars) → Stored as files in Supabase Storage (artifacts)
// - Small outputs → Stored as memos
// - Artifacts have file_url (no body field)
// - Memos reference artifacts via artefact_references (not text)

export const dynamic = 'force-dynamic'

import { executeToolCall } from "@/lib/tools/execute-tool-call";
import { createServerSupabaseClient, createSupabaseServerComponentClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { cleanLargePayload } from "@/lib/utils";

// uploadArtifactFile logic extracted into unified execute-tool-call layer

const INTERNAL_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function POST(req: NextRequest) {
  // Hoisted so the catch block can reference them for observability writes
  let taskId: string | undefined
  let goalId: string | undefined
  let toolName: string | undefined
  let userId: string | null = null

  try {
    const body = await req.json();
    taskId = body.taskId
    goalId = body.goalId
    toolName = body.toolName
    const bodyUserId = body.userId
    const args = body.args

    if (!taskId || !goalId) {
      return NextResponse.json({ error: "taskId and goalId are required" }, { status: 400 });
    }

    if (!process.env.COMPOSIO_API_KEY) {
      return NextResponse.json({ error: "COMPOSIO_API_KEY is not set" }, { status: 500 });
    }

    // Auth gate: accept either a valid user session OR the internal service secret.
    // The internal secret path is used by server-side workers (runWorkerTask).
    // External callers without a session or the secret are rejected.
    const internalSecret = req.headers.get('x-crost-internal-secret')

    if (internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
      // Trusted internal call — accept userId from body (must still pass ownership check below)
      userId = bodyUserId ?? null
    } else {
      // Browser / external call — derive userId from authenticated session only
      const authClient = await createSupabaseServerComponentClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
      }
      userId = user.id
    }

    const supabase = createServerSupabaseClient();

    // 1. GATEKEEPER: Verify task is approved and belongs to the authenticated user
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

    // Ownership check — compare against session-derived userId (not body userId for external calls)
    if (task.created_by !== null && task.created_by !== userId) {
      console.warn(`[Worker Execute] Ownership mismatch for task ${taskId}`);
      return NextResponse.json({ error: "Unauthorized: Task owner mismatch." }, { status: 403 });
    }

    // Status check
    const executableStatuses = ['approved', 'running', 'pending', 'planned'];
    if (!executableStatuses.includes(task.status)) {
      console.warn(`[Worker Execute] Task ${taskId} is in non-executable status: ${task.status}`);
      return NextResponse.json({ error: `Task is not in an executable state (status: ${task.status}).` }, { status: 403 });
    }

    // 2. LOCAL TOOL ROUTER
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

      // Strict read-only check
      const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'GRANT', 'REVOKE'];
      if (forbidden.some(word => sql.toUpperCase().includes(word))) {
        throw new Error("Unauthorized: SUPABASE_QUERY is restricted to SELECT operations only.");
      }

      const { data, error: sqlErr } = await supabase.rpc('read_only_query', { query_text: sql });
      if (sqlErr) {
        console.error(`[SUPABASE_QUERY Error]: ${sqlErr.message}`);

        // Hallucination guard
        if (sqlErr.message.includes('does not exist') || sqlErr.message.includes('column') || sqlErr.message.includes('relation')) {
          return NextResponse.json({
            needs_more_data: true,
            missing_data: [`Valid Database Schema for: ${sql}`],
            error: sqlErr.message,
            suggested_action: "Hallucination detected. Verify the table/column names in the actual database schema."
          }, { status: 200 });
        }
        throw sqlErr;
      }
      result = data;
    }
    else {
      // 3. EXTERNAL DYNAMIC TOOLS (Unified Execution Gateway)
      const parts = toolName.split(".");
      const service = parts[0] || toolName;
      const action = parts[1] || "";
      
      const executionResult = await executeToolCall({
        userId: userId!,
        departmentId: task.dept_slug,
        taskId,
        goalId: task.goal_id,
        toolCall: {
          service,
          action,
          params: args,
          reasoning: "Automated department call",
          risk: "medium", // Fallback, gateway re-evaluates
          requiresApproval: false // Fallback, gateway dynamically asserts CRITICAL_TOOLS
        }
      });
      
      // The gateway natively handles Memo logging, Artifacts, and Execution tracking!
      return NextResponse.json(executionResult, { status: 200 });
    }

    // Only REACHED if SUPABASE_QUERY or COMPANY_MEMOS
    // 4. Update Event Log for Internal Tools
    await supabase.from('event_log').insert({
      department_slug: task.dept_slug,
      goal_id: task.goal_id,
      event_type: 'tool_called',
      description: `Executed internal tool: ${toolName}`,
      metadata: cleanLargePayload({
        toolName,
        args,
        taskId,
      }),
      created_by: userId
    });

    return NextResponse.json({
      data: result,
      _metadata: { stored: 'internal' }
    }, { status: 200 });
  } catch (error: any) {
    console.error("[Worker Execute Error]:", error);

    try {
      const errorMsg = error.message || String(error);
      const supabase = createServerSupabaseClient();

      if (taskId && goalId) {
        await supabase
          .from('goal_tasks')
          .update({ status: 'failed', completed_at: new Date().toISOString() })
          .eq('task_id', taskId)
          .eq('goal_id', goalId);

        await supabase.from('event_log').insert({
          goal_id: goalId,
          event_type: 'task_failed',
          description: `Worker execute route error for task ${taskId}: ${errorMsg}`,
          metadata: { taskId, goalId, toolName: toolName ?? null, error: errorMsg },
          created_by: userId ?? null,
        });

        await supabase.from('company_memos').insert({
          goal_id: goalId,
          task_id: taskId,
          from_department: 'system',
          title: `Execution Failed: ${toolName ?? taskId}`,
          body: `Critical error in worker execute route:\n\n${errorMsg}`,
          priority: 'high',
          source_type: 'system',
          created_by: userId ?? null,
        });
      }
    } catch (dbErr) {
      console.error("[Worker Execute] Emergency observability write failed:", dbErr);
    }

    return NextResponse.json({ error: error.message || "Execution failed" }, { status: 500 });
  }
}
