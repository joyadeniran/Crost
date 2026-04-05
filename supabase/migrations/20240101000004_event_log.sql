-- Migration 004: Event Log
-- Immutable audit trail for all agent actions

CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT,                      -- Denormalized; survives dept deletion
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'task_started', 'task_completed', 'task_failed',
      'approval_requested', 'approval_approved', 'approval_rejected',
      'approval_expired', 'action_executed', 'action_execution_failed',
      'memo_written', 'tool_called', 'unauthorised_tool_call',
      'error', 'mode_switched', 'token_limit_hit',
      'department_created', 'department_updated', 'department_activated',
      'department_paused', 'department_deprecated', 'department_deleted',
      'model_pulled', 'constitution_updated'
    )),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_department ON event_log(department_slug);
CREATE INDEX idx_event_log_created_at ON event_log(created_at DESC);
CREATE INDEX idx_event_log_event_type ON event_log(event_type);
