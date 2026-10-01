-- Cloud SQL parity fixes — Session v13.10 (2026-06-11)
-- Applied to crost-hq:us-central1:crost-db to unblock the tool-execution + goal flow.
-- Idempotent. The original cloudsql_migration.sql was an incomplete port of
-- supabase/migrations/* — these statements close the gaps the app code depends on.

-- 1. tool_executions — never ported. Cloud SQL uses Firebase TEXT uids (no auth.users).
CREATE TABLE IF NOT EXISTS tool_executions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT,
  created_by        TEXT,
  goal_id           TEXT,
  task_id           TEXT,
  department_slug   TEXT,
  tool_slug         TEXT,
  action            TEXT NOT NULL,
  params            JSONB DEFAULT '{}'::jsonb,
  status            TEXT DEFAULT 'pending'
                      CHECK (status IN ('pending','running','success','failed','blocked')),
  risk              TEXT DEFAULT 'low',
  requires_approval BOOLEAN DEFAULT false,
  approval_id       TEXT,
  result_summary    TEXT,
  raw_result        JSONB,
  artefact_id       TEXT,
  artifact_id       TEXT,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_exec_user ON tool_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_exec_goal ON tool_executions(goal_id);

-- 2. company_memo (structured, single row per user) — never ported.
--    JSONB (not JSONB[]) so the Cloud SQL query-builder shim encodes cleanly.
CREATE TABLE IF NOT EXISTS company_memo (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL UNIQUE,
  company_profile     JSONB DEFAULT '{"name":null,"industry":null,"location":null,"description":null}'::jsonb,
  active_goals        JSONB DEFAULT '[]'::jsonb,
  strategies          JSONB DEFAULT '[]'::jsonb,
  task_logs           JSONB DEFAULT '[]'::jsonb,
  artefact_references JSONB DEFAULT '[]'::jsonb,
  decisions           JSONB DEFAULT '[]'::jsonb,
  department_notes    JSONB DEFAULT '{}'::jsonb,
  updated_by          TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 3. approval_queue — HITL tool path supplies user_id/task_id/tool_execution_id
--    and omits department_id/department_name; 'tool_call' must be a valid action_type.
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS task_id TEXT;
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS tool_execution_id TEXT;
ALTER TABLE approval_queue ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE approval_queue ALTER COLUMN department_name DROP NOT NULL;
ALTER TABLE approval_queue DROP CONSTRAINT IF EXISTS approval_queue_action_type_check;
ALTER TABLE approval_queue ADD CONSTRAINT approval_queue_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'send_email','post_social','send_message','merge_code','spend_budget',
    'create_document','run_query','delete_data','external_api_call','tool_call','other'
  ]));

-- 4. goal_tasks — orchestrator inserts created_by + expected_deliverable and omits
--    NOT-NULL orc_notes (a JSON column, so '' is invalid). Relax to nullable.
ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE goal_tasks ADD COLUMN IF NOT EXISTS expected_deliverable TEXT;
ALTER TABLE goal_tasks ALTER COLUMN orc_notes DROP NOT NULL;
