-- Migration: recurring_missions
-- Stores scheduled recurring goals with cadence and auto-dispatch settings.
-- Part of ORC_ORCHESTRATION_UPGRADE_PLAN.md Phase 3 (Week 5).

CREATE TABLE IF NOT EXISTS recurring_missions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             text        NOT NULL,
  founder_input     text        NOT NULL,
  cadence           text        NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  cadence_day       integer,    -- day of week (0=Sun…6=Sat) for weekly; day of month (1–31) for monthly
  next_run_at       timestamptz NOT NULL,
  last_run_at       timestamptz,
  last_goal_id      uuid        REFERENCES goals(id) ON DELETE SET NULL,
  source_goal_id    uuid        REFERENCES goals(id) ON DELETE SET NULL,
  is_active         boolean     NOT NULL DEFAULT true,
  auto_dispatch     boolean     NOT NULL DEFAULT false,
  risk_tier_limit   integer     NOT NULL DEFAULT 1 CHECK (risk_tier_limit BETWEEN 1 AND 3),
  run_count         integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_recurring_missions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recurring_missions_updated_at
  BEFORE UPDATE ON recurring_missions
  FOR EACH ROW EXECUTE FUNCTION update_recurring_missions_updated_at();

-- Index for the cron sweep: find due, active missions
CREATE INDEX idx_recurring_missions_due ON recurring_missions (next_run_at, is_active)
  WHERE is_active = true;

-- Index for per-user listing
CREATE INDEX idx_recurring_missions_user ON recurring_missions (user_id, created_at DESC);

-- RLS
ALTER TABLE recurring_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own recurring missions"
  ON recurring_missions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role bypass (needed for cron handler which uses service-role key)
CREATE POLICY "Service role bypass for recurring_missions"
  ON recurring_missions
  FOR ALL
  TO service_role
  USING  (true)
  WITH CHECK (true);
