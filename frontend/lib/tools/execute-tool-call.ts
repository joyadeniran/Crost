import { createServerSupabaseClient } from "@/lib/supabase";
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

// Department Permission Mask (beta: four fixed departments + orchestrator)
export const DEPARTMENT_TOOL_RULES: Record<string, string[]> = {
  marketing: ["gmail", "internal"],
  engineering: ["internal"],
  sales: ["gmail", "internal"],
  operations: ["gmail", "internal"],
  executive: ["gmail", "internal"] // orchestrator / founder access
};

// Safe default for any slug not in the allowlist above: internal-only (memos).
const DEFAULT_TOOL_RULES: string[] = ["internal"];

/**
 * Resolve the tool-service allowlist for a department slug.
 * - orchestrator/executive (and internal calls with no slug) keep full access
 * - known department slugs use their DEPARTMENT_TOOL_RULES entry
 * - unknown/custom slugs get the internal-only safe default
 */
export function getAllowedServices(departmentSlug?: string | null): string[] {
  if (!departmentSlug) return DEPARTMENT_TOOL_RULES['executive'];
  const slug = departmentSlug.toLowerCase();
  if (slug === 'orchestrator') return DEPARTMENT_TOOL_RULES['executive'];
  return DEPARTMENT_TOOL_RULES[slug] || DEFAULT_TOOL_RULES;
}

const CRITICAL_TOOLS = [
  "github.delete_branch",
  "gmail.delete_email",
  "hubspot.delete_contact"
];

/**
 * Approval gate for every external tool call (CROST_SPEC §11).
 *
 * Beta rule: NOTHING external executes without founder approval — there is no
 * auto-run path. This function validates department permission, writes the
 * execution skeleton + approval_queue row, and returns `requires_approval`.
 * Execution itself happens in PATCH /api/approvals/[id] after the founder
 * approves (native Gmail send; other actions are recorded).
 */
export async function executeToolCall(options: ExecuteOptions) {
  const { userId, departmentId, taskId, goalId, toolCall } = options;
  const { service, action, params, risk } = toolCall;
  const supabase = createServerSupabaseClient();
  const fullyQualifiedTool = `${service}.${action}`.toLowerCase();

  // 1. Department Permission Guard
  const allowedServices = getAllowedServices(departmentId);
  if (!allowedServices.includes(service.toLowerCase())) {
    return {
      status: "permission_denied",
      service,
      message: `Department [${departmentId}] is not authorized to use ${service}.`
    };
  }

  const toolRisk = CRITICAL_TOOLS.includes(fullyQualifiedTool) ? 'critical' : (risk || 'high')

  // 2. Write the execution skeleton to DB FIRST — always blocked until approved.
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
      status: "blocked",
      risk: toolRisk,
      requires_approval: true
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

  // 3. Approval request — action_type must satisfy approval_queue_action_type_check,
  // so we store 'tool_call' and stash the real action name in payload.__tool_action
  // (the PATCH executor in app/api/approvals/[id]/route.ts reads it from there).
  const { data: approvalRow, error: aqErr } = await supabase.from("approval_queue").insert({
    goal_id: goalId,
    task_id: taskId,
    user_id: userId,
    created_by: userId,
    tool_execution_id: executionLog.id,
    department_slug: departmentId,
    action_type: 'tool_call',
    action_label: fullyQualifiedTool,
    payload: { ...params, __service: service, __tool_action: normalizeToolName(fullyQualifiedTool) },
    context: toolCall.reasoning || `Approval required for ${fullyQualifiedTool}`,
    risk_level: toolRisk,
    status: "pending",
  }).select('id').single();

  if (aqErr || !approvalRow?.id) {
    console.error("[HITL] Failed to insert approval_queue row:", aqErr?.message, (aqErr as any)?.details);
    // Roll back the skeleton so no orphaned 'blocked' row remains.
    await supabase.from('tool_executions')
      .update({ status: 'failed', result_summary: `Failed to create approval: ${aqErr?.message ?? 'no row returned'}` })
      .eq('id', executionLog.id);
    throw new Error(`Failed to create approval request: ${aqErr?.message ?? 'approval_queue insert returned no row'}`);
  }

  // Paper trail
  await supabase.from("company_memos").insert({
    from_department: 'system',
    goal_id: goalId,
    title: `Action Paused: ${fullyQualifiedTool}`,
    body: `Action \`${fullyQualifiedTool}\` requested by ${departmentId} is paused awaiting Founder approval.`,
    tags: ['system', 'tool_approval'],
    priority: 'high',
    created_by: userId
  });

  await supabase.from('event_log').insert({
    goal_id: goalId,
    department_slug: departmentId,
    event_type: 'approval_requested',
    description: `Approval required: ${fullyQualifiedTool}`,
    metadata: {
      approval_id: approvalRow.id,
      tool: fullyQualifiedTool,
      risk_level: toolRisk,
      task_id: taskId,
    },
    created_by: userId,
  });

  return {
    status: "requires_approval",
    execution_id: executionLog.id,
    approval_id: approvalRow.id,
    service,
    action,
    message: `Execution paused. Approval required for ${fullyQualifiedTool}`
  };
}
