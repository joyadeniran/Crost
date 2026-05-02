
-- Migration: 20260502221500_add_skipped_to_goal_tasks.sql
-- Adds 'skipped' to the goal_tasks_status_check constraint.

ALTER TABLE goal_tasks DROP CONSTRAINT IF EXISTS goal_tasks_status_check;

ALTER TABLE goal_tasks ADD CONSTRAINT goal_tasks_status_check
  CHECK (status IN (
    'pending',            -- awaiting founder approval
    'planned',            -- orchestrator has drafted but not shown to founder (optional)
    'approved',           -- founder approved
    'pending_dependency', -- approved but waiting for other tasks
    'dispatched',         -- worker has been called
    'running',            -- worker is currently executing (v5 synonym for dispatched)
    'completed',          -- success
    'failed',             -- terminal error
    'rejected',           -- founder dismissed the task
    'skipped',            -- founder skipped the task (satisfies dependency)
    'expired',            -- approval window closed
    'needs_data'          -- blocked waiting for founder input
  ));
