-- CROST HARDENING MIGRATION v1.1
-- Purpose: Complete Multi-tenant Isolation across all core tables

-- 1. AUTH ID for the current founder (to avoid constraint failures during migration)
DO $$
DECLARE
  first_user_id UUID;
BEGIN
  SELECT id INTO first_user_id FROM auth.users LIMIT 1;
  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in auth.users. Please sign up at least once before running this hardening migration.';
  END IF;

  -- 2. EVENT LOG - Add created_by & RLS
  IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name = 'event_log' AND column_name = 'created_by') THEN
    ALTER TABLE event_log ADD COLUMN created_by UUID;
    UPDATE event_log SET created_by = first_user_id WHERE created_by IS NULL;
    ALTER TABLE event_log ALTER COLUMN created_by SET NOT NULL;
    ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can see their own event_log" ON event_log FOR SELECT USING (auth.uid() = created_by);
    CREATE POLICY "Users can insert their own event_log" ON event_log FOR INSERT WITH CHECK (auth.uid() = created_by);
  END IF;

  -- 3. GOALS - Add created_by & RLS
  IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'created_by') THEN
    ALTER TABLE goals ADD COLUMN created_by UUID;
    UPDATE goals SET created_by = first_user_id WHERE created_by IS NULL;
    ALTER TABLE goals ALTER COLUMN created_by SET NOT NULL;
    ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can manage their own goals" ON goals FOR ALL USING (auth.uid() = created_by);
  END IF;

  -- 4. ARTIFACTS - Add created_by & RLS
  IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name = 'artifacts' AND column_name = 'created_by') THEN
    ALTER TABLE artifacts ADD COLUMN created_by UUID;
    UPDATE artifacts SET created_by = first_user_id WHERE created_by IS NULL;
    ALTER TABLE artifacts ALTER COLUMN created_by SET NOT NULL;
    ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can manage their own artifacts" ON artifacts FOR ALL USING (auth.uid() = created_by);
  END IF;

  -- 5. APPROVAL QUEUE - Add created_by & RLS
  IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name = 'approval_queue' AND column_name = 'created_by') THEN
    ALTER TABLE approval_queue ADD COLUMN created_by UUID;
    UPDATE approval_queue SET created_by = first_user_id WHERE created_by IS NULL;
    ALTER TABLE approval_queue ALTER COLUMN created_by SET NOT NULL;
    ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can manage their own approvals" ON approval_queue FOR ALL USING (auth.uid() = created_by);
  END IF;

  -- 6. COMPANY MEMOS - Add created_by & RLS
  IF NOT EXISTS (SELECT column_name FROM information_schema.columns WHERE table_name = 'company_memos' AND column_name = 'created_by') THEN
    ALTER TABLE company_memos ADD COLUMN created_by UUID;
    UPDATE company_memos SET created_by = first_user_id WHERE created_by IS NULL;
    ALTER TABLE company_memos ALTER COLUMN created_by SET NOT NULL;
    ALTER TABLE company_memos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Users can manage their own memos" ON company_memos FOR ALL USING (auth.uid() = created_by);
  END IF;

END $$;
