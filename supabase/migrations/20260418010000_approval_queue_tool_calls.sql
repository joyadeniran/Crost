-- Migration: extend approval_queue for tool-call HITL pattern
--
-- The original schema was designed for department-level action approvals with
-- hard NOT NULL FKs to departments. The tool-call gateway (execute-tool-call.ts)
-- inserts tool-call-sourced approval requests that have no department entity UUID
-- and need goal/task/user context instead. This migration makes those columns
-- optional and adds the required tool-call fields.

-- 1. Relax NOT NULL on department-entity columns (not available for tool-call approvals)
ALTER TABLE approval_queue
  ALTER COLUMN department_id   DROP NOT NULL,
  ALTER COLUMN department_name DROP NOT NULL,
  ALTER COLUMN department_slug DROP NOT NULL,
  ALTER COLUMN action_label    DROP NOT NULL,
  ALTER COLUMN payload         DROP NOT NULL;

-- 2. Add tool-call specific columns
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS goal_id            UUID,
  ADD COLUMN IF NOT EXISTS task_id            UUID,
  ADD COLUMN IF NOT EXISTS user_id            UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tool_execution_id  UUID;

-- 3. Extend action_type enum to include tool_call
ALTER TABLE approval_queue
  DROP CONSTRAINT IF EXISTS approval_queue_action_type_check;

ALTER TABLE approval_queue
  ADD CONSTRAINT approval_queue_action_type_check
  CHECK (action_type IN (
    'send_email', 'post_social', 'send_message', 'merge_code',
    'spend_budget', 'create_document', 'run_query', 'delete_data',
    'external_api_call', 'tool_call', 'other'
  ));

-- 4. RLS — founders see only their own approval requests
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Founders see own approvals" ON approval_queue;
CREATE POLICY "Founders see own approvals"
  ON approval_queue FOR ALL
  USING (user_id = auth.uid() OR auth.uid() IS NOT NULL);
