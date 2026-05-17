-- Migration: orc_decision_log table
-- Records every Orc routing decision and its eventual outcome.
-- Used for the self-improvement loop (ORC_ORCHESTRATION_UPGRADE_PLAN.md §D.3)
-- Phase 2 creates the table; Phase 3 wires up the learning query.

CREATE TABLE IF NOT EXISTS orc_decision_log (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id              UUID        REFERENCES goals(id) ON DELETE SET NULL,
  decision_type        TEXT        NOT NULL,   -- 'response_mode_selection', 'dept_assignment', etc.
  founder_intent       TEXT,
  orc_choice           TEXT        NOT NULL,   -- the mode or dept chosen
  confidence           FLOAT       CHECK (confidence >= 0.0 AND confidence <= 1.0),
  assumptions          JSONB       DEFAULT '{}',
  risk_tier            INT         CHECK (risk_tier IN (1, 2, 3)),
  risk_notes           TEXT[]      DEFAULT '{}',
  capability_gaps      JSONB       DEFAULT '[]',
  founder_override     BOOLEAN     DEFAULT false,
  override_reason      TEXT,
  outcome              TEXT        CHECK (outcome IN ('successful', 'partial', 'failed', 'unknown')),
  outcome_description  TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  outcome_at           TIMESTAMPTZ
);

ALTER TABLE orc_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own decision log"
  ON orc_decision_log FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_orc_decision_log_user_goal
  ON orc_decision_log (user_id, goal_id);

CREATE INDEX IF NOT EXISTS idx_orc_decision_log_outcome
  ON orc_decision_log (user_id, outcome, created_at DESC)
  WHERE outcome IS NOT NULL;
