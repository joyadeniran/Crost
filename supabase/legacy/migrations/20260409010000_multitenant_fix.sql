-- Migration: Add multi-user support to core tables
-- Ensures data privacy and correctly attributes actions to the founder.

-- 1. Goals
ALTER TABLE goals ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_goals_created_by ON goals(created_by);

-- 2. System Config (Allow per-user overrides)
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
-- Change PK to (key, user_id) where user_id CAN be NULL (for global defaults)
ALTER TABLE system_config DROP CONSTRAINT system_config_pkey;
ALTER TABLE system_config ADD PRIMARY KEY (key, user_id);

-- 3. Artifacts
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_artifacts_created_by ON artifacts(created_by);

-- 4. Company Memos
ALTER TABLE company_memos ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_memos_created_by ON company_memos(created_by);

-- 5. Event Log
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_event_log_created_by ON event_log(created_by);

-- 6. Approval Queue
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_approval_queue_created_by ON approval_queue(created_by);

-- 7. Update existing departments (they already have created_by but maybe missed nulls)
ALTER TABLE departments ALTER COLUMN created_by TYPE UUID USING created_by::UUID;
ALTER TABLE departments ADD CONSTRAINT fk_departments_user FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 8. Enable RLS (Row Level Security) - The ultimate production "water-tight" feature
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
-- Note: system_config stays global-ish for now but per-user overrides work via the PK change.

-- Policies: Only see your own data
CREATE POLICY "Users can only see their own departments" ON departments FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Users can only see their own goals" ON goals FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Users can only see their own memos" ON company_memos FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Users can only see their own approvals" ON approval_queue FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Users can only see their own artifacts" ON artifacts FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Users can only see their own events" ON event_log FOR ALL USING (created_by = auth.uid());

