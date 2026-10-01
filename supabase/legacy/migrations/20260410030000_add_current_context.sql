-- Migration: 20260410030000_add_current_context.sql
-- Adds is_current_context and task_id to company_memos.

-- 1. Add columns
ALTER TABLE company_memos 
  ADD COLUMN IF NOT EXISTS is_current_context BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS task_id TEXT; -- Link to goal_tasks.task_id

-- 2. Create indexes
CREATE INDEX IF NOT EXISTS idx_memos_current_context ON company_memos(is_current_context) WHERE is_current_context = true;
CREATE INDEX IF NOT EXISTS idx_memos_task_id ON company_memos(task_id);

-- 3. Update RLS Policies
DROP POLICY IF EXISTS "Users can view own memos" ON company_memos;
CREATE POLICY "Users can view own memos"
  ON company_memos
  FOR SELECT
  USING (created_by = auth.uid() OR is_foundational = true OR is_current_context = true);

COMMENT ON COLUMN company_memos.is_current_context IS 'True for memos that are part of the active execution context. Prioritized in agent prompts alongside foundational memos.';
COMMENT ON COLUMN company_memos.task_id IS 'The task_id that produced this memo. Used for strict dependency enforcement.';
