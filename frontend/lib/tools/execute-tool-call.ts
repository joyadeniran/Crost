import { createServerSupabaseClient } from "@/lib/supabase";
import { runComposioTool, ToolResult } from "./providers/composio";
import { detectOutputType } from "@/lib/artifact-transformers";
import { addTaskLog, addArtifactReference } from "../company-memo";
import { normalizeToolName } from "@/lib/utils";

export type ToolCallPayload = {
  service: string;
  action: string;
  params: Record<string, any>;
  reasoning: string;
  risk: "low" | "medium" | "high" | "critical";
  requiresApproval: boolean;
};

type ExecuteOptions = {
  userId: string;
  departmentId: string; // The slug
  taskId: string;
  goalId: string | null;
  toolCall: ToolCallPayload;
};

// Department Permission Mask
export const DEPARTMENT_TOOL_RULES: Record<string, string[]> = {
  marketing: ["gmail", "slack", "notion", "internal"],
  engineering: ["github", "linear", "slack", "internal"],
  sales: ["gmail", "hubspot", "apollo", "slack", "notion", "internal"],
  finance: ["gmail", "googlesheets", "internal"],
  executive: ["gmail", "slack", "notion", "googlecalendar", "internal", "github", "hubspot", "linear", "apollo", "googlesheets", "web_search", "file_reader", "supabase_query"] // God-mode for orchestrator/executive/founder access
};

// Auto-run rules
const LOW_RISK_READ_TOOLS = [
  "gmail.search_emails",
  "gmail.get_message",
  "gmail.list_messages",
  "github.get_pull_request",
  "github.list_pull_requests",
  "notion.search_docs",
  "notion.get_page",
  "slack.read_channel_history"
];

const CRITICAL_TOOLS = [
  "github.delete_branch",
  "gmail.delete_email",
  "hubspot.delete_contact"
];

/**
 * Humanizes tool results with actionable deep links (Gmail, GitHub, etc.)
 */
function humanizeToolResult(result: ToolResult): string {
  if (!result.success) return result.summary || "Execution failed.";
  
  const data = result.data as any;
  const service = result.service.toLowerCase();
  const action = result.action.toLowerCase();

  // Gmail Deep Links
  if (service === 'gmail') {
    if ((action === 'send_email' || action === 'create_draft') && data?.id) {
      return `${result.summary} [View in Gmail](https://mail.google.com/mail/u/0/#all/${data.id})`;
    }
  }

  // GitHub Deep Links
  if (service === 'github') {
    if (data?.html_url) {
      return `${result.summary} [View on GitHub](${data.html_url})`;
    }
    if (data?.url && data.url.includes('github.com')) {
      return `${result.summary} [View on GitHub](${data.url})`;
    }
  }

  return result.summary || "Action completed successfully.";
}

export async function executeToolCall(options: ExecuteOptions) {
  const { userId, departmentId, taskId, goalId, toolCall } = options;
  const { service, action, params, risk } = toolCall;
  const supabase = createServerSupabaseClient();
  const fullyQualifiedTool = `${service}.${action}`.toLowerCase();

  // 1. Internal tool bypass — handles both service='internal' (worker path)
  //    and service='knowledge_base_search' (/ command path from ChatCommandMenu).
  const INTERNAL_TOOL_SLUGS = new Set(['knowledge_base_search', 'knowledge_base_read'])
  if (service.toLowerCase() === 'internal' || INTERNAL_TOOL_SLUGS.has(service.toLowerCase()) || action.toLowerCase() === 'knowledge_base_read') {
    const isRead = action.toLowerCase() === 'knowledge_base_read' || service.toLowerCase() === 'knowledge_base_read';
    const apiPath = isRead ? '/api/knowledge/read' : '/api/knowledge/search';
    
    const internalSecret = process.env.WORKER_INTERNAL_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const searchResult = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${apiPath}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-crost-internal-secret': internalSecret,
        },
        body: JSON.stringify({
          userId,
          // For search:
          query: params.query || params.text || params.q || '',
          category: params.category,
          limit: params.limit || 5,
          // For read:
          file_id: params.file_id || params.id || (isRead ? params.text : null)
        })
      }
    );
    const json = await searchResult.json();

    // Humanize search results for the UI
    if (json.matches && Array.isArray(json.matches)) {
      if (json.matches.length === 0) return { result: 'No matching documents found in Knowledge Base.' };
      const list = json.matches.map((m: any) => 
        `📄 **${m.title}** (${m.category})\nID: \`${m.file_id || 'available'}\`\nRelevance: ${Math.round((m.relevance ?? 0) * 100)}%\nSummary: ${m.summary}\n`
      ).join('\n---\n\n');
      return { result: `I found ${json.matches.length} relevant documents:\n\n${list}` };
    }

    // Humanize read results
    if (isRead && json.success) {
      return { result: `### Content of ${json.title}\n\n${json.content}\n\n---` };
    }

    if (json?.error) {
      return { result: `Knowledge Base error: ${json.error}` };
    }

    if (typeof json === 'string') {
      return { result: json };
    }

    if (!json || (typeof json === 'object' && Object.keys(json).length === 0)) {
      return { result: 'No results found in Knowledge Base.' };
    }

    const fallback = JSON.stringify(json);
    return { result: `Knowledge Base response: ${fallback.length > 1200 ? `${fallback.slice(0, 1200)}...` : fallback}` };
  }

  // 2. Connection Guard: Does the user have this service hooked up?
  const { checkConnectionWithJIT } = await import("@/lib/composio-connection");
  const { isConnected, error: connError } = await checkConnectionWithJIT(userId, service);

  if (!isConnected) {
    return {
      status: "missing_connection",
      service,
      message: connError || `${service.toUpperCase()} is not connected. Open Settings → Integrations and connect it, then retry.`
    };
  }

  // 2. Department Permission Guard
  const allowedServices = DEPARTMENT_TOOL_RULES[departmentId.toLowerCase()] || DEPARTMENT_TOOL_RULES['executive'];
  if (!allowedServices.includes(service.toLowerCase())) {
    return {
      status: "permission_denied",
      service,
      message: `Department [${departmentId}] is not authorized to use ${service}.`
    };
  }

  // 3. Approval Routing Guard — HITL DEFAULT-DENY (CROST_SPEC §11).
  // Per spec: "NOTHING executes without founder approval."
  // Risk mode (Careful / Balanced / Aggressive) determines the threshold.
  // Careful    → all actions require approval
  // Balanced   → low-risk read-only auto-runs; medium+ requires approval
  // Aggressive → low + medium auto-run; high + critical always require approval
  const { data: riskConfig } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'risk_tolerance')
    .eq('user_id', userId)
    .maybeSingle()
  const riskMode = (riskConfig?.value as string) ?? 'balanced'

  let requiresApproval: boolean
  const isReadOnly = LOW_RISK_READ_TOOLS.includes(fullyQualifiedTool)
  const toolRisk = risk || 'high'

  if (riskMode === 'careful') {
    // Careful: everything requires approval
    requiresApproval = true
  } else if (riskMode === 'aggressive') {
    // Aggressive: low + medium auto-run; high + critical require approval
    if (isReadOnly && (toolRisk === 'low' || toolRisk === 'medium')) {
      requiresApproval = toolCall.requiresApproval === true
    } else {
      requiresApproval = true
    }
  } else {
    // Balanced (default): low auto-runs; medium + high + critical require approval
    if (isReadOnly && toolRisk === 'low') {
      requiresApproval = toolCall.requiresApproval === true
    } else {
      requiresApproval = true
    }
  }

  // Critical tools always require approval regardless of risk mode
  if (CRITICAL_TOOLS.includes(fullyQualifiedTool)) {
    requiresApproval = true
  }

  // Write the execution skeleton to DB FIRST so it can be blocked if needed
  const { data: executionLog, error: execErr } = await supabase
    .from("tool_executions")
    .insert({
      user_id: userId,
      goal_id: goalId,
      task_id: taskId,
      department_slug: departmentId,
      tool_slug: service,
      action: action,
      params: params,
      status: requiresApproval ? "blocked" : "running",
      risk: toolCall.risk,
      requires_approval: requiresApproval
    })
    .select("id")
    .single();

  if (execErr || !executionLog) {
    console.error("[executeToolCall] Failed to insert tool_execution log:", {
      error: execErr,
      userId,
      service,
      taskId,
      goalId
    });
    throw new Error(`Failed to track tool execution: ${execErr?.message || 'DB Error'}`);
  }

  if (requiresApproval) {
    // Generate an approval request — column names must match approval_queue schema.
    // action_type must satisfy approval_queue_action_type_check (only enum values
    // are allowed). The fully-qualified tool name (e.g. "gmail.send_email") is
    // not a valid enum, so we always store 'tool_call' and stash the real
    // composio action name in payload.__tool_action — the PATCH executor reads
    // it from there (see frontend/app/api/approvals/[id]/route.ts).
    const { data: approvalRow, error: aqErr } = await supabase.from("approval_queue").insert({
      goal_id: goalId,
      task_id: taskId,
      user_id: userId,
      created_by: userId,           // Required for RLS and pending count queries
      tool_execution_id: executionLog.id,
      department_slug: departmentId,
      action_type: 'tool_call',
      action_label: fullyQualifiedTool,
      payload: { ...params, __service: service, __tool_action: normalizeToolName(fullyQualifiedTool) },
      context: toolCall.reasoning || `HITL approval required for ${fullyQualifiedTool}`,
      risk_level: risk || "high",
      status: "pending",
    }).select('id').single();

    if (aqErr || !approvalRow?.id) {
      console.error("[HITL] Failed to insert approval_queue row:", aqErr?.message, aqErr?.details);
      // Roll back the execution skeleton so we don't leave an orphaned 'blocked'
      // tool_executions row that the UI can never resolve.
      await supabase.from('tool_executions')
        .update({ status: 'failed', result_summary: `Failed to create approval: ${aqErr?.message ?? 'no row returned'}` })
        .eq('id', executionLog.id);
      throw new Error(`Failed to create approval request: ${aqErr?.message ?? 'approval_queue insert returned no row'}`);
    }

    // Write a system memo so there's a paper trail
    await supabase.from("company_memos").insert({
      from_department: 'system',
      goal_id: goalId,
      title: `Tool Execution Paused: ${fullyQualifiedTool}`,
      body: `Action \`${fullyQualifiedTool}\` requested by ${departmentId} has been paused awaiting Founder approval.\n\nReason: High-risk action detected.`,
      tags: ['system', 'tool_approval'],
      priority: 'high',
      created_by: userId
    });

    // Emit approval_requested to event_log so the event panel and Orc can react
    await supabase.from('event_log').insert({
      goal_id: goalId,
      department_slug: departmentId,
      event_type: 'approval_requested',
      description: `HITL approval required: ${fullyQualifiedTool}`,
      metadata: {
        approval_id: approvalRow.id,
        tool: fullyQualifiedTool,
        risk_level: risk || 'high',
        task_id: taskId,
      },
      created_by: userId,
    });

    return {
      status: "requires_approval",
      execution_id: executionLog.id,
      approval_id: approvalRow?.id, // THE FIX: Return actual approval ID
      service,
      action,
      message: `Execution paused. HITL approval required for ${fullyQualifiedTool}`
    };
  }

  // 4. Execution Layer
  try {
    const result: ToolResult = await runComposioTool({
      userId,
      service,
      action,
      params
    });

    // 5. Memory Routing & Separation (Memos vs Artifacts)
    const { artifactId: createdArtifactId } = await handleToolResultArchiving({
      result,
      userId,
      departmentId,
      taskId,
      goalId,
      executionId: executionLog.id
    });

    return { ...result, artifact_id: createdArtifactId } as ToolResult & { artifact_id: string | null };
  } catch (execError: any) {
    const errorMsg = execError.message || String(execError);
    console.error("[executeToolCall] Runtime failure:", errorMsg);
    
    await supabase.from("tool_executions").update({
      status: "failed",
      result_summary: `Runtime execution error: ${errorMsg}`
    }).eq("id", executionLog.id);
    
    throw execError;
  }
}

/**
 * Handles the separation logic for tool outputs.
 * Large structs go to Supabase storage artifacts. Plaint text to Memos.
 */
async function handleToolResultArchiving({
  result,
  userId,
  departmentId,
  taskId,
  goalId,
  executionId
}: {
  result: ToolResult;
  userId: string;
  departmentId: string;
  taskId: string;
  goalId: string | null;
  executionId: string;
}): Promise<{ artifactId: string | null }> {
  const supabase = createServerSupabaseClient();
  let fullBodyText = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
  const strippedText = fullBodyText.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  const isStructured = (strippedText.startsWith('{') && strippedText.endsWith('}')) || (strippedText.startsWith('[') && strippedText.endsWith(']'));

  let artifactId: string | null = null;
  let memoBody = '';

  if (isStructured && result.success) {
    // Upload large outputs as artifacts
    const detection = detectOutputType(fullBodyText, true);
    // Note: We bypass full artifact transformation pipeline here for simplicity in gateway and just dump as json
    const time = Date.now();
    const fileName = `tool-${taskId}-${time}.json`;

    const storageBucket = goalId ? `goals/${goalId}/${fileName}` : `direct/${userId}/${fileName}`
    const { data: uploadData } = await supabase.storage.from('artifacts').upload(storageBucket, fullBodyText, { contentType: 'application/json' });
    if (uploadData) {
      const { data: urldata } = supabase.storage.from('artifacts').getPublicUrl(uploadData.path);
      const { data: artifact } = await supabase.from('artifacts').insert({
        goal_id: goalId,
        department_slug: departmentId,
        artifact_type: 'data',
        title: `Tool Output: ${result.service}.${result.action}`,
        file_url: urldata.publicUrl,
        created_by: userId,
        // Sandbox: tool outputs land in 'draft' until founder reviews
        status: 'draft',
        version: 1,
        sources: {
          memo_ids: [],
          kb_file_ids: [],
          tool_calls: [{ service: result.service, action: result.action, executed_at: new Date().toISOString() }],
        },
      }).select('id').single();

      if (artifact) {
        artifactId = artifact.id;
        memoBody = `Executed tool: ${result.service}.${result.action}\n\nOutput saved as downloadable artifact (ID: ${artifact.id}).`;
        
        // DUAL-WRITE: Add artifact reference to singular company_memo (§8)
        addArtifactReference(supabase, userId, artifact.id).catch(() => {});

        // Generate suggested next-step chips for this tool-output artifact (§6.1)
        try {
          const { generateAndInsertSuggestedActions } = await import('../suggested-actions')
          const actionIds = await generateAndInsertSuggestedActions({
            source_entity_type: 'artifact',
            source_entity_id: artifact.id,
            goal_id: goalId,
            artifact_type: 'data',
            file_url: urldata.publicUrl,
            artifact_title: `Tool Output: ${result.service}.${result.action}`,
            created_by: userId,
          })
          if (actionIds.length > 0) {
            await supabase.from('artifacts').update({ suggested_actions: actionIds }).eq('id', artifact.id)
          }
        } catch (saErr) {
          console.error('[handleToolResultArchiving] suggestedActions insert failed (non-fatal):', saErr)
        }
      } else {
        memoBody = fullBodyText.substring(0, 2000) + '(truncated)';
      }
    } else {
      memoBody = fullBodyText.substring(0, 2000) + '(truncated)';
    }
  } else {
    // Narrative output
    memoBody = fullBodyText.length > 2000 ? fullBodyText.substring(0, 2000) + '\n\n...(truncated)' : fullBodyText;
  }

  // Update Execution Log completion
  const humanSummary = humanizeToolResult(result);
  await supabase.from("tool_executions").update({
    status: result.success ? "success" : "failed",
    result_summary: humanSummary,
    raw_result: result.rawResponse,
    artefact_id: artifactId
  }).eq("id", executionId);

  // DUAL-WRITE: Add task log to singular company_memo (§8)
  addTaskLog(supabase, userId, {
    id: executionId,
    goal_id: goalId || '',
    dept_slug: departmentId,
    title: `Tool: ${result.service}.${result.action}`,
    status: result.success ? 'completed' : 'failed',
    result: result.summary || humanSummary.slice(0, 200),
    artifact_id: artifactId,
    created_at: new Date().toISOString()
  }).catch(() => {});

  // Write to Company Memos (plural/legacy)
  await supabase.from('company_memos').insert({
    from_department: departmentId,
    goal_id: goalId,
    title: `Tool Result: ${result.service}.${result.action}`,
    body: humanSummary || memoBody,
    tags: ['tool_output', `task_${taskId}`],
    priority: 'normal',
    created_by: userId,
    metadata: {
      toolName: `${result.service}.${result.action}`,
      hasArtifact: !!artifactId,
      artifactId
    }
  });

  return { artifactId: artifactId ?? null };
}
