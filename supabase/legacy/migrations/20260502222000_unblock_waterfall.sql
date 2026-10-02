
-- Migration: 20260502222000_unblock_waterfall.sql
-- 1. Adds 'skipped' to the goal_tasks_status_check constraint.
-- 2. Adds missing 'expected_deliverable' column to goal_tasks.

-- Update status constraint
ALTER TABLE goal_tasks DROP CONSTRAINT IF EXISTS goal_tasks_status_check;

ALTER TABLE goal_tasks ADD CONSTRAINT goal_tasks_status_check
  CHECK (status IN (
    'pending', 'planned', 'approved', 'pending_dependency', 'dispatched', 
    'running', 'completed', 'failed', 'rejected', 'skipped', 'expired', 'needs_data'
  ));

-- Add missing expected_deliverable column
ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS expected_deliverable TEXT;

COMMENT ON COLUMN goal_tasks.expected_deliverable IS 'Description of what this task produces. Required per Spec §6.';
