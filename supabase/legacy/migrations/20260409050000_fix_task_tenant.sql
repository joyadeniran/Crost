-- Migration: 20260409050000_fix_task_tenant.sql
-- Adds created_by to goal_tasks and enables RLS.

-- 1. Add created_by column
ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Populate created_by from the parent goals table
UPDATE goal_tasks t
SET created_by = g.created_by
FROM goals g
WHERE t.goal_id = g.id;

-- 3. Enable RLS
ALTER TABLE goal_tasks ENABLE ROW LEVEL SECURITY;

-- 4. Policies
CREATE POLICY "Users can only see their own goal tasks" ON goal_tasks FOR ALL USING (created_by = auth.uid());
