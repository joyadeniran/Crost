import { createServerSupabaseClient } from "@/lib/supabase";
import { runComposioTool, ToolResult } from "./providers/composio";
import { detectOutputType } from "@/lib/artifact-transformers";

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
  goalId: string;
  toolCall: ToolCallPayload;
};

// Department Permission Mask
const DEPARTMENT_TOOL_RULES: Record<string, string[]> = {
  marketing: ["gmail", "slack", "notion", "internal"],
  engineering: ["github", "linear", "slack", "internal"],
  sales: ["gmail", "hubspot", "apollo", "slack", "notion", "internal"],
  finance: ["gmail", "googlesheets", "internal"],
  executive: ["gmail", "slack", "notion", "googlecalendar", "internal"] // Default orchestrator/executive access
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

export async function executeToolCall(options: ExecuteOptions) {
  const { userId, departmentId, taskId, goalId, toolCall } = options;
  const { service, action, params, risk } = toolCall;
  const supabase = createServerSupabaseClient();
  const fullyQualifiedTool = `${service}.${action}`.toLowerCase();

  // 1. Internal tool bypass — knowledge_base_search and future internal tools
  if (service.toLowerCase() === 'internal') {
    const searchResult = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/knowledge/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, query: params.query, category: params.category, limit: params.limit || 5 })
      }
    );
    return searchResult.json();
  }

  // 2. Connection Guard: Does the user have this service hooked up?
  const { data: connection, error: connErr } = await supabase
    .from("connections")
    .select("*")
    .eq("user_id", userId)
    .eq("tool_slug", service)
    .single();

  if (connErr || !connection || connection.status !== "connected") {
    return {
      status: "missing_connection",
      service,
      message: `${service.toUpperCase()} is not connected. Orc must request connection.`
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

  // 3. Approval Routing Guard
  let requiresApproval = toolCall.requiresApproval;
  
  if (CRITICAL_TOOLS.includes(fullyQualifiedTool)) {
    requiresApproval = true;
  } else if (!LOW_RISK_READ_TOOLS.includes(fullyQualifiedTool) && (risk === "high" || risk === "critical")) {
    requiresApproval = true;
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

  if (execErr || !executionLog) throw new Error("Failed to track tool execution");

  if (requiresApproval) {
    // Generate an approval request
    await supabase.from("approval_queue").insert({
      goal_id: goalId,
      task_id: taskId,
      requested_by: departmentId,
      user_id: userId,
      type: "content_review",
      status: "pending",
      context: {
        tool_execution_id: executionLog.id,
        service,
        action,
        params,
        reasoning: toolCall.reasoning || `Security protocol: HITL approval required for ${fullyQualifiedTool}`,
        is_tool_call: true
      }
    });

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

    return {
      status: "requires_approval",
      execution_id: executionLog.id,
      service,
      action,
      message: `Execution paused. HITL approval required for ${fullyQualifiedTool}`
    };
  }

  // 4. Execution Layer
  const result: ToolResult = await runComposioTool({
    userId,
    service,
    action,
    params
  });

  // 5. Memory Routing & Separation (Memos vs Artifacts)
  await handleToolResultArchiving({
    result,
    userId,
    departmentId,
    taskId,
    goalId,
    executionId: executionLog.id
  });

  return result;
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
  goalId: string;
  executionId: string;
}) {
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

    const { data: uploadData } = await supabase.storage.from('artifacts').upload(`goals/${goalId}/${fileName}`, fullBodyText, { contentType: 'application/json' });
    if (uploadData) {
      const { data: urldata } = supabase.storage.from('artifacts').getPublicUrl(uploadData.path);
      const { data: artifact } = await supabase.from('artifacts').insert({
        goal_id: goalId,
        department_slug: departmentId,
        artifact_type: 'data',
        title: `Tool Output: ${result.service}.${result.action}`,
        file_url: urldata.publicUrl,
        created_by: userId
      }).select('id').single();

      if (artifact) {
        artifactId = artifact.id;
        memoBody = `Executed tool: ${result.service}.${result.action}\n\nOutput saved as downloadable artifact (ID: ${artifact.id}).`;
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
  await supabase.from("tool_executions").update({
    status: result.success ? "success" : "failed",
    result_summary: result.summary,
    raw_result: result.rawResponse,
    artefact_id: artifactId
  }).eq("id", executionId);

  // Write to Company Memos
  await supabase.from('company_memos').insert({
    from_department: departmentId,
    goal_id: goalId,
    title: `Tool Result: ${result.service}.${result.action}`,
    body: memoBody,
    tags: ['tool_output', `task_${taskId}`],
    priority: 'normal',
    created_by: userId,
    metadata: {
      toolName: `${result.service}.${result.action}`,
      hasArtifact: !!artifactId,
      artifactId
    }
  });
}
