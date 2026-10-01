-- Migration 8: Add is_orchestrator column to departments
-- Marks the single orchestrator row — only one row can be true at a time.
-- Also adds the 'orchestrator' slug to reserved slugs.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS is_orchestrator BOOLEAN NOT NULL DEFAULT FALSE;

-- Enforce only one orchestrator can exist at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_one_orchestrator
  ON departments (is_orchestrator)
  WHERE is_orchestrator = TRUE;

-- Add 'orchestrator' to reserved slugs by updating the trigger function
CREATE OR REPLACE FUNCTION check_reserved_slugs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IN (
    'system', 'admin', 'api', 'memos', 'approvals',
    'settings', 'onboarding', 'health', 'toggle', 'status',
    'dashboard', 'departments', 'activate', 'deprecate',
    'orchestrator'  -- reserved for the single orchestrator persona
  ) AND NOT NEW.is_orchestrator THEN
    RAISE EXCEPTION 'Slug "%" is reserved by Crost and cannot be used for a regular department.', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN departments.is_orchestrator IS 'True for the single Orchestrator persona. Only one row may have is_orchestrator = true.';
