-- Migration: Fix RLS Security and Missing Schema
-- 1. DROP the permissive policy that bypasses all security
DROP POLICY IF EXISTS "authenticated_full_access" ON departments;
DROP POLICY IF EXISTS "authenticated_full_access" ON approval_queue;
DROP POLICY IF EXISTS "authenticated_full_access" ON company_memos;
DROP POLICY IF EXISTS "authenticated_full_access" ON event_log;
DROP POLICY IF EXISTS "authenticated_full_access" ON system_config;
DROP POLICY IF EXISTS "authenticated_full_access" ON available_tools;
DROP POLICY IF EXISTS "authenticated_full_access" ON goals;
DROP POLICY IF EXISTS "authenticated_full_access" ON goal_tasks;
DROP POLICY IF EXISTS "authenticated_full_access" ON artifacts;

-- 2. Add missing column to goal_tasks
ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS expected_deliverable TEXT;

-- 3. Onyx Cleanup: Rename columns to be Orc-centric/Generic
ALTER TABLE departments RENAME COLUMN onyx_persona_id TO orc_persona_id;
ALTER TABLE available_tools RENAME COLUMN onyx_connector_id TO connector_id;

-- 4. Ensure User ownership policy exists for goal_tasks (it was missing from the loop in CONSOLIDATED_STABILIZATION)
DROP POLICY IF EXISTS "User ownership" ON goal_tasks;
CREATE POLICY "User ownership" ON goal_tasks FOR ALL USING (auth.uid() = created_by);

COMMENT ON COLUMN goal_tasks.expected_deliverable IS 'Specific outcome this task must produce, defined by the Orchestrator.';
COMMENT ON COLUMN departments.orc_persona_id IS 'Reference to a specific Orc-managed prompt or persona configuration.';
COMMENT ON COLUMN available_tools.connector_id IS 'External connector or integration ID (e.g. Composio/Managed Auth ID).';
