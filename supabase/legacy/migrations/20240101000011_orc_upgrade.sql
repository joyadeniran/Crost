-- Migration 011: Orc Upgrade
-- Implements: goal_tasks table (idempotency + depends_on + supervision),
--             goals enhancements (env_mode_snapshot, orc_session_id),
--             company_memos provenance fields (confidence, based_on, source_type),
--             new event_type values for Orc supervision loop.

-- ─── 1. goal_tasks table ─────────────────────────────────────────────────────
-- Replaces the flat orchestrator_plan.tasks JSON blob.
-- Each task is a row — enables idempotency, depends_on enforcement, and supervision.

CREATE TABLE IF NOT EXISTS goal_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id       TEXT NOT NULL,              -- orchestrator-assigned UUID (from plan JSON)
  dept_slug     TEXT NOT NULL,             -- 'sales' | 'marketing' | 'ops' | any future dept
  action        TEXT NOT NULL,
  label         TEXT NOT NULL,
  reasoning     TEXT NOT NULL DEFAULT '',
  params        JSONB NOT NULL DEFAULT '{}',
  risk_level    TEXT NOT NULL DEFAULT 'medium'
                  CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  depends_on    TEXT[] NOT NULL DEFAULT '{}', -- array of task_ids this task depends on
  model         TEXT NOT NULL DEFAULT 'groq/llama-3.3-70b-versatile',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN (
                    'pending',            -- awaiting founder approval
                    'approved',           -- founder approved, waiting for dependencies
                    'pending_dependency', -- dependencies not yet complete
                    'dispatched',         -- worker has been called
                    'completed',          -- worker returned success
                    'failed',             -- worker returned error
                    'rejected',           -- founder rejected
                    'expired'             -- approval window closed
                  )),
  assigned_at   TIMESTAMPTZ,              -- when dispatched to worker
  completed_at  TIMESTAMPTZ,             -- when terminal status reached
  orc_notes     JSONB NOT NULL DEFAULT '[]', -- JSONB array of Orc supervision notes
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: a task_id can only appear once per goal
  CONSTRAINT goal_tasks_unique_task_per_goal UNIQUE (goal_id, task_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_goal_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goal_tasks_updated_at
  BEFORE UPDATE ON goal_tasks
  FOR EACH ROW EXECUTE FUNCTION update_goal_tasks_updated_at();

-- Indexes for supervision loop queries
CREATE INDEX IF NOT EXISTS idx_goal_tasks_goal_id   ON goal_tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_status     ON goal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_goal_tasks_dept_slug  ON goal_tasks(dept_slug);

COMMENT ON TABLE goal_tasks IS 'Individual tasks within a goal. Replaces the flat orchestrator_plan.tasks JSONB for supervision, idempotency, and dependency tracking.';
COMMENT ON COLUMN goal_tasks.task_id IS 'Orchestrator-assigned UUID. Unique per goal — enforced by UNIQUE constraint.';
COMMENT ON COLUMN goal_tasks.depends_on IS 'Array of task_ids that must reach completed status before this task can be dispatched.';
COMMENT ON COLUMN goal_tasks.orc_notes IS 'JSONB array of timestamped notes written by Orc during supervision: {ts, note, action_taken}.';

-- ─── 2. goals table enhancements ─────────────────────────────────────────────

-- env_mode at the time the goal was dispatched — locked for the goal's lifetime
-- Prevents mode-toggle mid-execution from breaking the orchestrator's model assignments
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS env_mode_snapshot   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS orc_session_id      TEXT DEFAULT NULL,     -- Onyx chat session ID for persistent Orc
  ADD COLUMN IF NOT EXISTS last_status_check   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supervision_interval_seconds INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN goals.env_mode_snapshot IS 'env_mode (local|cloud) captured at first task dispatch. All workers in this goal read from here, not live env_mode.';
COMMENT ON COLUMN goals.orc_session_id IS 'Onyx chat session ID for Orc''s persistent supervision session. One session per active goal.';
COMMENT ON COLUMN goals.last_status_check IS 'Timestamp of last Orc supervision tick for this goal.';

-- ─── 3. company_memos enhancements ───────────────────────────────────────────

-- Provenance and confidence fields for inter-agent trust model
ALTER TABLE company_memos
  ADD COLUMN IF NOT EXISTS source_type         TEXT NOT NULL DEFAULT 'agent'
                             CHECK (source_type IN ('founder', 'agent', 'orchestrator', 'external', 'system')),
  ADD COLUMN IF NOT EXISTS confidence          FLOAT NOT NULL DEFAULT 0.5
                             CHECK (confidence >= 0.0 AND confidence <= 1.0),
  ADD COLUMN IF NOT EXISTS based_on            TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence_decay_days INTEGER NOT NULL DEFAULT 90;

COMMENT ON COLUMN company_memos.source_type IS 'Who wrote this memo. Orc uses lower weight for agent-originating content.';
COMMENT ON COLUMN company_memos.confidence IS 'Writer''s stated confidence in the memo content [0.0–1.0]. Legacy memos default to 0.5 (neutral).';
COMMENT ON COLUMN company_memos.based_on IS 'Data sources used to write this memo. e.g. {campaign_data, past_results}.';
COMMENT ON COLUMN company_memos.confidence_decay_days IS 'Days after which this memo should be treated as stale. Orc flags high-confidence memos older than this threshold.';

CREATE INDEX IF NOT EXISTS idx_memos_confidence ON company_memos(confidence, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_source_type ON company_memos(source_type);

-- ─── 4. event_log: expand allowed event_types ─────────────────────────────────
-- Drop the old CHECK constraint and replace with an expanded one that includes
-- Orc supervision events and artifact tracking.

ALTER TABLE event_log DROP CONSTRAINT IF EXISTS event_log_event_type_check;

ALTER TABLE event_log ADD CONSTRAINT event_log_event_type_check
  CHECK (event_type IN (
    -- Existing types
    'task_started', 'task_completed', 'task_failed',
    'approval_requested', 'approval_approved', 'approval_rejected',
    'approval_expired', 'action_executed', 'action_execution_failed',
    'memo_written', 'tool_called', 'unauthorised_tool_call',
    'error', 'mode_switched', 'token_limit_hit',
    'department_created', 'department_updated', 'department_activated',
    'department_paused', 'department_deprecated', 'department_deleted',
    'model_pulled', 'constitution_updated', 'artifact_created',
    -- New Orc supervision types
    'orc_status_check',
    'orc_rebalance',
    'orc_escalation',
    'orc_stall_detected',
    'goal_closed',
    'goal_mission_report_written',
    'goal_received',
    'plan_drafted',
    'plan_approved',
    -- Token enforcement
    'token_budget_blocked'
  ));

-- ─── 5. approval_queue: add expires_at guard index ───────────────────────────
-- The expiry edge function doesn't exist yet — add a partial index to make
-- the expiry query fast when it does run.

CREATE INDEX IF NOT EXISTS idx_approval_queue_pending_expired
  ON approval_queue(expires_at)
  WHERE status = 'pending';
