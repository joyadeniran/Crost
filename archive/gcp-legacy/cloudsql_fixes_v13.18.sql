-- Cloud SQL parity fix — Session v13.18 (2026-07-02)
-- Phase 3 (10x rebuild): bounded retries + dead-letter for scripts/worker.ts.
--
-- goal_tasks currently has no way to bound how many times a stalled/crashed
-- 'running' task gets silently reset back to 'pending' — the pre-existing
-- boot-time recovery in scripts/worker.ts reset stale tasks unconditionally,
-- forever, with no backoff and no dead-letter. This adds the columns needed
-- for bounded retries with exponential backoff, and a 'failed_permanent'
-- dead-letter status for tasks that exhaust their retries.
--
-- Idempotent.

ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

ALTER TABLE goal_tasks DROP CONSTRAINT IF EXISTS goal_tasks_status_check;
ALTER TABLE goal_tasks ADD CONSTRAINT goal_tasks_status_check
  CHECK (status IN (
    'pending',
    'planned',
    'approved',
    'pending_dependency',
    'dispatched',
    'running',
    'completed',
    'failed',
    'failed_permanent',
    'rejected',
    'skipped',
    'expired',
    'needs_data'
  ));
