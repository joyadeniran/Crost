// Worker Execute Route — Task Execution with Proper Memo/Artifact Separation
// Per CROST_SPEC Section 5-6:
// - Large outputs (>1200 chars) → Stored as files in Supabase Storage (artifacts)
// - Small outputs → Stored as memos
// - Artifacts have file_url (no body field)
// - Memos reference artifacts via artefact_references (not text)

import { Composio } from "@composio/core";
import { createServerSupabaseClient } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { cleanLargePayload } from "@/lib/utils";
import { detectOutputType } from "@/lib/artifact-transformers";

export const dynamic = 'force-dynamic'

// Helper: Try to parse JSON
function tryParseJSON(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// Helper: Upload artifact file to Supabase Storage
async function uploadArtifactFile(
  content: string,
  taskId: string,
  goalId: string,
  deptSlug: string,
  toolName: string,
  userId: string,
  supabase: any
): Promise<{ id: string; file_url: string } | null> {
  try {
    // Detect content type
    const isJson = tryParseJSON(content);
    const detection = detectOutputType(content, isJson);
    
    let fileContent: string | Buffer = content;
    if (detection.targetFormat !== 'json' && detection.transformer) {
      try {
        const parsedContent = isJson ? JSON.parse(content) : content;
        fileContent = await detection.transformer(parsedContent) as string | Buffer;
      } catch (err) {
        console.error('[Format Transformation Error]', err);
        // Fallback to json output on failure
        fileContent = content;
        detection.targetFormat = isJson ? 'json' : 'txt';
      }
    }

    let fileType = 'text/plain';
    let extension = `.${detection.targetFormat}`;
    let artifactType: 'document' | 'data' | 'spreadsheet' = 'document';

    if (detection.targetFormat === 'json') {
      fileType = 'application/json';
      artifactType = 'data';
    } else if (detection.targetFormat === 'xlsx' || detection.targetFormat === 'csv') {
      fileType = detection.targetFormat === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv';
      artifactType = 'spreadsheet';
    } else if (detection.targetFormat === 'docx') {
      fileType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      artifactType = 'document';
    } else if (detection.targetFormat === 'md') {
      fileType = 'text/markdown';
      artifactType = 'document';
    }

    // Generate filename
    const timestamp = Date.now();
    const fileName = `task-${taskId}-${timestamp}${extension}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadErr } = await supabase
      .storage
      .from('artifacts')
      .upload(`goals/${goalId}/${fileName}`, fileContent, {
        contentType: fileType,
        upsert: false,
      });

    if (uploadErr || !uploadData) {
      console.error('[Artifact Upload Error]', uploadErr);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase
      .storage
      .from('artifacts')
      .getPublicUrl(uploadData.path);

    const fileUrl = urlData.publicUrl;

    // Store metadata in artifacts table
    const { data: artifact, error: artifactErr } = await supabase
      .from('artifacts')
      .insert({
        goal_id: goalId,
        department_slug: deptSlug,
        artifact_type: artifactType,
        title: `Tool Output: ${toolName}`,
        file_url: fileUrl,
        metadata: {
          toolName,
          taskId,
          source: 'tool_execution',
          contentType: fileType,
          sizeBytes: content.length,
        },
        created_by: userId,
      })
      .select('id')
      .single();

    if (artifactErr || !artifact) {
      console.error('[Artifact Metadata Error]', artifactErr);
      return null;
    }

    return { id: artifact.id, file_url: fileUrl };
  } catch (err) {
    console.error('[Create Artifact Error]', err);
    return null;
  }
}

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

    // Ownership check
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
      // 3. EXTERNAL DYNAMIC TOOLS (via Composio)
      if (!process.env.COMPOSIO_API_KEY) throw new Error("COMPOSIO_API_KEY missing.");
      const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });

      try {
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

    // 4. PERSIST: Save result using SEPARATION LOGIC
    //    - Structured JSON (any size) → artifact file (docx/xlsx/md)
    //    - Narrative/plain text       → memo only
    let bodyText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    const fullBodyText = bodyText;

    // Strip markdown fences before structure detection
    const strippedText = fullBodyText.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
    const isStructured = (strippedText.startsWith('{') && strippedText.endsWith('}')) ||
                         (strippedText.startsWith('[') && strippedText.endsWith(']'));

    let artifactId: string | null = null;
    let memoBody = '';

    if (isStructured) {
      // Any structured JSON → Store as typed artifact file
      const artifact = await uploadArtifactFile(
        fullBodyText,
        taskId,
        task.goal_id,
        task.dept_slug,
        toolName,
        userId,
        supabase
      );

      if (artifact) {
        artifactId = artifact.id;
        memoBody = `Tool executed: ${toolName}\n\nOutput saved as downloadable artifact (ID: ${artifact.id}).\nAccess via artifacts section.`;
      } else {
        // Fallback if artifact creation fails
        memoBody = bodyText.substring(0, 3000) + (bodyText.length > 3000 ? '\n\n... [Output truncated]' : '');
      }
    } else {
      // Narrative / plain-text content → Store as memo only
      memoBody = bodyText.length > 3000
        ? bodyText.substring(0, 3000) + '\n\n... [Output truncated for memo storage]'
        : bodyText;
    }

    // Store memo with proper reference structure
    await supabase.from('company_memos').insert({
      from_department: task.dept_slug,
      goal_id: task.goal_id,
      title: `Tool Output: ${toolName}`,
      body: memoBody,
      tags: ['tool_output', `task_${taskId}`],
      priority: 'normal',
      source_type: 'agent',
      metadata: {
        toolName,
        taskId,
        hasArtifact: !!artifactId,
        artifactId: artifactId || null,
        contentType: tryParseJSON(fullBodyText) ? 'json' : (fullBodyText.includes(',') ? 'csv' : 'text')
      },
      created_by: userId
    });

    // 5. Update Event Log
    await supabase.from('event_log').insert({
      department_slug: task.dept_slug,
      goal_id: task.goal_id,
      event_type: 'tool_called',
      description: `Executed tool: ${toolName}${artifactId ? ' → Created artifact' : ''}`,
      metadata: cleanLargePayload({
        toolName,
        args,
        taskId,
        artifactId,
        outputSize: fullBodyText.length,
        isStructured,
        result: typeof result === 'object' ? { status: 'success' } : result
      }),
      created_by: userId
    });

    return NextResponse.json({
      ...result,
      _metadata: {
        artifactId,
        stored: artifactId ? 'artifact' : 'memo',
        outputSize: fullBodyText.length
      }
    }, { status: 200 });
  } catch (error: any) {
    console.error("[Worker Execute Error]:", error);
    return NextResponse.json({ error: error.message || "Execution failed" }, { status: 500 });
  }
}
