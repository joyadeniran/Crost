-- Migration 014: V5 Architecture Task States
-- Implements the exact execution state machine as defined in Crost MVP Intelligence Architecture v5.0

ALTER TABLE goal_tasks DROP CONSTRAINT IF EXISTS goal_tasks_status_check;

ALTER TABLE goal_tasks ADD CONSTRAINT goal_tasks_status_check
  CHECK (status IN (
    'pending',
    'planned',
    'approved',
    'running',
    'completed',
    'failed',
    'needs_data'
  ));
