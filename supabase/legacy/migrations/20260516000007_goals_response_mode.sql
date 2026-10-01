-- Migration: add response_mode and orc_decision columns to goals
-- Additive (backward-compatible) — existing consumers of goals table are unaffected.
-- response_mode: which of the 5 modes Orc chose for this goal
-- orc_decision:  full OrcDecision JSON from the pre-classifier (for transparency/debugging)

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS response_mode TEXT
    CHECK (response_mode IN ('assistant', 'clarify', 'quick_plan', 'full_plan', 'direct_action', 'command', 'escalate')),
  ADD COLUMN IF NOT EXISTS orc_decision JSONB;

CREATE INDEX IF NOT EXISTS idx_goals_response_mode
  ON goals (response_mode)
  WHERE response_mode IS NOT NULL;
