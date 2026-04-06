// types/index.ts — All shared TypeScript types for Crost

export type ActivationStage = 'draft' | 'review' | 'active' | 'paused' | 'deprecated'
export type DepartmentStatus = 'idle' | 'running' | 'awaiting_approval' | 'error' | 'paused'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ModelProvider = 'local' | 'gemini' | 'claude' | 'groq'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired' | 'failed'
export type MemoPriority = 'low' | 'normal' | 'high' | 'urgent'
export type GoalStatus = 'pending' | 'planning' | 'awaiting_approval' | 'executing' | 'completed' | 'failed'
export type WorkerDept = 'sales' | 'marketing' | 'ops'

export type ActionType =
  | 'send_email'
  | 'post_social'
  | 'send_message'
  | 'merge_code'
  | 'spend_budget'
  | 'create_document'
  | 'run_query'
  | 'delete_data'
  | 'external_api_call'
  | 'other'

export type EventType =
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_expired'
  | 'action_executed'
  | 'action_execution_failed'
  | 'memo_written'
  | 'tool_called'
  | 'unauthorised_tool_call'
  | 'error'
  | 'mode_switched'
  | 'token_limit_hit'
  | 'department_created'
  | 'department_updated'
  | 'department_activated'
  | 'department_paused'
  | 'department_deprecated'
  | 'department_deleted'
  | 'model_pulled'
  | 'constitution_updated'
  | 'artifact_created'

export interface Department {
  id: string
  name: string
  slug: string
  activation_stage: ActivationStage
  persona_prompt: string
  tone_override: string | null
  capabilities: string[]
  restrictions: string[]
  model_provider: ModelProvider
  model_name: string
  tools: string[]
  status: DepartmentStatus
  current_task: string | null
  last_active_at: string | null
  onyx_persona_id: string | null
  icon: string
  color: string
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface ApprovalQueueItem {
  id: string
  department_id: string
  department_name: string
  department_slug: string
  action_type: ActionType
  action_label: string
  reasoning: string          // MANDATORY — auto-rejected if empty
  payload: Record<string, unknown>
  context: string | null
  risk_level: RiskLevel
  status: ApprovalStatus
  goal_id: string | null
  requested_at: string
  decided_at: string | null
  decided_by: string | null
  expires_at: string
  execution_result: Record<string, unknown> | null
  retry_count: number
}

export interface CompanyMemo {
  id: string
  from_department: string
  from_department_id: string | null
  title: string
  body: string
  tags: string[]
  priority: MemoPriority
  onyx_index_id: string | null
  created_at: string
  read_by: string[]
}

export interface Artifact {
  id: string
  goal_id: string | null
  department_id: string | null
  department_slug: string
  artifact_type: 'image' | 'document' | 'code' | 'data' | 'spreadsheet'
  title: string
  body: string | null
  metadata: Record<string, unknown>
  preview_url: string | null
  created_at: string
}

export interface EventLogEntry {
  id: string
  department_id: string | null
  department_slug: string | null
  event_type: EventType
  description: string
  metadata: Record<string, unknown>
  tokens_used: number
  model_used: string | null
  created_at: string
}

export interface SystemConfig {
  key: string
  value: unknown
  is_founder_editable: boolean
  updated_at: string
}

export interface AvailableTool {
  id: string
  label: string
  description: string
  requires_config: boolean
  is_configured: boolean
  onyx_connector_id: string | null
  risk_level: RiskLevel
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  code?: string       // Machine-readable error code for UI to handle
  warning?: string
  timestamp: string
}

// ─── Orchestrator + Worker types ─────────────────────────────────────────────

export interface OrchestratorTask {
  id: string
  dept: WorkerDept
  action: string
  label: string
  reasoning: string          // MANDATORY — never null
  params: Record<string, unknown>
  risk_level: RiskLevel
  model: string
  depends_on: string[]
}

export interface OrchestratorPlan {
  goal: string
  risk_note: string          // MANDATORY — never null or empty
  data_gathered: {
    sales: string | null
    marketing: string | null
    ops: string | null
  }
  tasks: OrchestratorTask[]
}

export interface Goal {
  id: string
  title: string
  founder_input: string
  orchestrator_plan: OrchestratorPlan | null
  risk_note: string | null
  status: GoalStatus
  outcome: string | null
  created_at: string
  updated_at: string
}

export interface WorkerTask {
  id: string
  action: string
  label: string
  reasoning: string
  params: Record<string, unknown>
  risk_level: RiskLevel
  model: string
}

export interface WorkerResult {
  task_id: string
  status: 'completed' | 'failed' | 'needs_approval'
  result: Record<string, unknown>
  memo_summary: string
  errors: string[]
  flags?: string[]           // ops only
}
