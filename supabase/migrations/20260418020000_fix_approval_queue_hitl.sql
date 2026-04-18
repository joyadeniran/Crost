-- Migration: fix HITL approval_queue RLS and add mission_report event type
--
-- Fixes:
-- 1. Broken RLS policy (user_id = auth.uid() OR auth.uid() IS NOT NULL was always true)
-- 2. Ensure approval_queue action_type CHECK includes tool_call (idempotent)
-- 3. Add goal_mission_report_written to event_log event_type CHECK

-- 1. Fix RLS: drop the broken over-permissive policy, create correct one
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Founders see own approvals" ON approval_queue;
DROP POLICY IF EXISTS "Users can only see their own approvals" ON approval_queue;

CREATE POLICY "Founders see own approvals"
  ON approval_queue FOR ALL
  USING (
    created_by = auth.uid()
    OR user_id  = auth.uid()
  );

-- 2. Ensure action_type CHECK includes tool_call (idempotent rebuild)
ALTER TABLE approval_queue
  DROP CONSTRAINT IF EXISTS approval_queue_action_type_check;

ALTER TABLE approval_queue
  ADD CONSTRAINT approval_queue_action_type_check
  CHECK (action_type IN (
    'send_email', 'post_social', 'send_message', 'merge_code',
    'spend_budget', 'create_document', 'run_query', 'delete_data',
    'external_api_call', 'tool_call', 'other'
  ));

-- 3. Ensure nullable department columns (idempotent — DROP NOT NULL is safe if already nullable)
ALTER TABLE approval_queue
  ALTER COLUMN department_id   DROP NOT NULL,
  ALTER COLUMN department_name DROP NOT NULL,
  ALTER COLUMN department_slug DROP NOT NULL,
  ALTER COLUMN action_label    DROP NOT NULL,
  ALTER COLUMN payload         DROP NOT NULL;

-- 4. Add tool-call columns if not already present
ALTER TABLE approval_queue
  ADD COLUMN IF NOT EXISTS goal_id           UUID,
  ADD COLUMN IF NOT EXISTS task_id           UUID,
  ADD COLUMN IF NOT EXISTS user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tool_execution_id UUID;

-- 5. Add goal_mission_report_written to event_log event_type CHECK
--    (renames goal_post_mortem_written → adds both for backward compat)
DO $$
BEGIN
  -- Drop the existing constraint if it doesn't already include mission_report
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'event_log_event_type_check'
      AND check_clause NOT LIKE '%mission_report%'
  ) THEN
    ALTER TABLE event_log DROP CONSTRAINT IF EXISTS event_log_event_type_check;
    ALTER TABLE event_log ADD CONSTRAINT event_log_event_type_check CHECK (event_type IN (
      'task_started', 'task_completed', 'task_failed', 'task_rejected', 'task_held',
      'goal_created', 'goal_planning', 'goal_completed', 'goal_failed', 'goal_cancelled',
      'goal_post_mortem_written', 'goal_mission_report_written',
      'approval_requested', 'approval_approved', 'approval_rejected', 'approval_expired',
      'department_created', 'department_activated', 'department_updated', 'department_deactivated',
      'tool_executed', 'tool_blocked', 'tool_failed',
      'memo_created', 'artifact_created',
      'system_error', 'system_warning', 'system_info'
    ));
  END IF;
END;
$$;
