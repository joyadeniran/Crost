-- Migration 7: goals table
-- Stores every goal the founder submits, the orchestrator's plan, and execution status.
-- This is the spine of the Orchestrator → Plan → Approve → Execute loop.

CREATE TABLE IF NOT EXISTS goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,                          -- Short title derived from founder input
  founder_input TEXT NOT NULL,                         -- Verbatim founder text
  orchestrator_plan JSONB,                             -- Full JSON plan from orchestrator (null until planning completes)
  risk_note    TEXT,                                   -- One-sentence risk assessment (mandatory once plan exists)
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed')),
  outcome      TEXT,                                   -- Summary written after completion
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every change
CREATE OR REPLACE FUNCTION update_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_goals_updated_at();

-- Index for fast status filtering (dashboard polls for active goals)
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_created_at ON goals(created_at DESC);

-- Add goal_id reference to approval_queue so approvals can be linked back to their goal
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

-- Add goal_id reference to event_log as well
ALTER TABLE event_log
  ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE SET NULL;

-- Add reasoning field to approval_queue (mandatory per spec — missing reasoning = auto-reject)
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS reasoning TEXT;

COMMENT ON TABLE goals IS 'Every goal submitted by the founder. The orchestrator plan is stored as JSONB once generated.';
COMMENT ON COLUMN goals.orchestrator_plan IS 'Full JSON matching OrchestratorPlan type. NULL until orchestrator responds.';
COMMENT ON COLUMN goals.risk_note IS 'Mandatory one-sentence risk assessment from orchestrator. Never null once plan exists.';
COMMENT ON COLUMN approval_queue.goal_id IS 'Links this approval back to the goal that triggered it.';
COMMENT ON COLUMN approval_queue.reasoning IS 'Why this action is needed — mandatory. Requests without reasoning are auto-rejected.';
