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

  // 1. Internal tool bypass — handles both service='internal' (worker path)
  //    and service='knowledge_base_search' (/ command path from ChatCommandMenu).
  const INTERNAL_TOOL_SLUGS = new Set(['knowledge_base_search'])
  if (service.toLowerCase() === 'internal' || INTERNAL_TOOL_SLUGS.has(service.toLowerCase())) {
    const searchResult = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/knowledge/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // params.text is the raw string when invoked via /knowledge_base_search <text>
        body: JSON.stringify({ userId, query: params.query || params.text || params.q || '', category: params.category, limit: params.limit || 5 })
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
    .maybeSingle();

  if (connErr || !connection || connection.status !== "connected") {
    // JUST-IN-TIME SYNC: Before failing, check Composio directly in case DB is stale
    // (e.g. user connected via onboarding or another tab but didn't visit settings)
    try {
      const { Composio } = await import("@composio/core");
      const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
      const session = await composio.create(userId);
      const toolkitsResult = await session.toolkits();
      const toolkits = (toolkitsResult as any).items || [];
      
      const toolkit = toolkits.find((t: any) => t.name.toLowerCase() === service.toLowerCase());
      const isConnected = toolkit?.connection?.isActive ?? false;

      if (isConnected) {
        // Heal the DB record
        await supabase.from("connections").upsert({
          user_id: userId,
          tool_slug: service,
          composio_connection_id: toolkit.connection.connectedAccount?.id || 'managed',
          status: 'connected',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id, tool_slug' });

        // Update available_tools too
        await supabase.from("available_tools").update({ is_configured: true })
          .eq("user_id", userId)
          .or(`id.eq.${service},id.like.${service}_%`);
          
        console.log(`[JIT Sync] Healed connection for ${service} for user ${userId}`);
      } else {
        return {
          status: "missing_connection",
          service,
          message: `${service.toUpperCase()} is not connected. Open Settings → Integrations and connect it, then retry.`
        };
      }
    } catch (jitErr) {
      console.error("[JIT Sync Failed]", jitErr);
      return {
        status: "missing_connection",
        service,
        message: `${service.toUpperCase()} is not connected. Open Settings → Integrations and connect it, then retry.`
      };
    }
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

  if (execErr || !executionLog) throw new Error("Failed to track tool execution");

  if (requiresApproval) {
    // Generate an approval request — column names must match approval_queue schema
    const { error: aqErr } = await supabase.from("approval_queue").insert({
      goal_id: goalId,
      task_id: taskId,
      user_id: userId,
      created_by: userId,           // Required for RLS and pending count queries
      tool_execution_id: executionLog.id,
      department_slug: departmentId,
      action_type: fullyQualifiedTool,
      action_label: `${service}.${action}`,
      payload: { ...params, __service: service, __tool_action: normalizeToolName(fullyQualifiedTool) },
      context: toolCall.reasoning || `HITL approval required for ${fullyQualifiedTool}`,
      risk_level: risk || "high",
      status: "pending",
    });

    if (aqErr) {
      console.error("[HITL] Failed to insert approval_queue row:", aqErr.message, aqErr.details);
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
  const { artifactId: createdArtifactId } = await handleToolResultArchiving({
    result,
    userId,
    departmentId,
    taskId,
    goalId,
    executionId: executionLog.id
  });

  return { ...result, artifact_id: createdArtifactId } as ToolResult & { artifact_id: string | null };
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
        // Spec §9: citations — record the tool call that produced this artefact.
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
  await supabase.from("tool_executions").update({
    status: result.success ? "success" : "failed",
    result_summary: result.summary,
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
    result: result.summary || memoBody.slice(0, 200),
    artifact_id: artifactId,
    created_at: new Date().toISOString()
  }).catch(() => {});

  // Write to Company Memos (plural/legacy)
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

  return { artifactId: artifactId ?? null };
}
