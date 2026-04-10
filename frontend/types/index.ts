// types/index.ts — All shared TypeScript types for Crost

export type ActivationStage = 'draft' | 'review' | 'active' | 'paused' | 'deprecated'
export type DepartmentStatus = 'idle' | 'running' | 'awaiting_approval' | 'error' | 'paused'
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ModelProvider = 'local' | 'gemini' | 'claude' | 'groq'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired' | 'failed'
export type MemoPriority = 'low' | 'normal' | 'high' | 'urgent'
export type GoalStatus = 'pending' | 'clarifying' | 'planning' | 'awaiting_approval' | 'executing' | 'completed' | 'failed'
// WorkerDept is intentionally a string — not a union — so new departments created
// in the database work without a code change or deploy. The 3 canonical MVP slugs
// are (sales, marketing, ops) but the system must not hardcode them.
export type WorkerDept = string

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
  | 'tool_executed'
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
  // Orc supervision events
  | 'orc_status_check'
  | 'orc_rebalance'
  | 'orc_escalation'
  | 'orc_stall_detected'
  | 'goal_closed'
  | 'goal_post_mortem_written'
  | 'goal_received'
  | 'plan_drafted'
  | 'plan_approved'
  | 'token_budget_blocked'

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
  created_at: string
  read_by: string[]
  // Memo tiers (migrations 010, 030)
  is_foundational: boolean        // Always included in context — generated from company_profile
  is_current_context: boolean     // Temporal founder answers to clarifying/needs_data requests
  task_id: string | null          // Links memo to the goal_task that produced it
  valid_until: string | null      // Expiry for context memos — workers ignore expired ones
  version_tag: string | null      // Batch versioning (e.g. 'goal_iteration_1')
  // Provenance & confidence (migration 011)
  source_type: 'founder' | 'agent' | 'orchestrator' | 'external' | 'system'
  confidence: number              // [0.0–1.0]. Legacy memos default to 0.5
  based_on: string[]             // data sources used when writing this memo
  confidence_decay_days: number  // days after which memo is flagged as stale by Orc
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
  expected_deliverable: string // What Orc expects this worker to produce
}

export interface OrchestratorPlan {
  goal: string
  risk_note: string          // MANDATORY — never null or empty
  data_gathered: Record<string, string | null>
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
  orc_conversation?: { role: 'user' | 'assistant', content: string, ts: string }[]
  created_at: string
  updated_at: string
  // Orc upgrade fields (migration 011)
  env_mode_snapshot: 'local' | 'cloud' | null  // locked at first dispatch
  orc_session_id: string | null                 // Onyx chat session for persistent Orc
  last_status_check: string | null
  supervision_interval_seconds: number
  goal_tasks?: GoalTask[]
}

// GoalTask — a single task row within a goal (replaces orchestrator_plan.tasks flat JSON)
export type GoalTaskStatus =
  | 'pending'
  | 'planned'
  | 'approved'
  | 'running'
  | 'completed'
  | 'failed'
  | 'needs_data'

export interface GoalTask {
  id: string
  goal_id: string
  task_id: string             // orchestrator-assigned UUID, unique per goal
  dept_slug: string           // open string — not restricted to 3 hardcoded slugs
  action: string
  label: string
  reasoning: string
  params: Record<string, unknown>
  risk_level: RiskLevel
  depends_on: string[]        // task_ids that must complete before this dispatches
  model: string
  status: GoalTaskStatus
  assigned_at: string | null
  completed_at: string | null
  orc_notes: Array<{ ts: string; note: string; action_taken: string }>
  created_at: string
  updated_at: string
}

export interface WorkerTask {
  id: string
  action: string
  label: string
  reasoning: string
  expected_deliverable: string
  params: Record<string, unknown>
  risk_level: RiskLevel
  model: string
}

export interface WorkerResult {
  task_id: string
  status: 'completed' | 'failed' | 'needs_approval' | 'needs_data'
  result: Record<string, unknown>
  memo_summary: string
  errors: string[]
  flags?: string[]           // ops only
  // MCP Extension
  tool_request?: { tool: string, params: Record<string, any> }
  // Confidence provenance — written to company_memos on every result
  confidence?: number        // [0.0–1.0], defaults to 0.5 if not provided by worker
  based_on?: string[]        // data sources the worker used
}
