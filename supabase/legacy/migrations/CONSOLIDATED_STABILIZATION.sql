-- ==============================================================================
-- CROST CONSOLIDATED STABILIZATION MIGRATION (Version 3.0)
-- ==============================================================================

-- 1. CLOUD ENHANCEMENTS: Connections table for Composio/Managed Auth
CREATE TABLE IF NOT EXISTS connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(created_by, service_name)
);

-- 2. MULTI-TENANCY: Ensure all core tables have owner columns
-- Force UUID type to avoid "uuid = text" operator mismatches
ALTER TABLE goals ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE company_memos ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE event_log ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE approval_queue ADD COLUMN IF NOT EXISTS created_by UUID;

-- Special handling for departments: ensure column exists and is UUID
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='created_by') THEN
        ALTER TABLE departments ADD COLUMN created_by UUID;
    ELSE
        -- If it exists as text, try to cast it
        ALTER TABLE departments ALTER COLUMN created_by TYPE UUID USING created_by::uuid;
    END IF;
END $$;

-- Add foreign keys separately to avoid failure if already exists
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_created_by_fkey, ADD CONSTRAINT goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_created_by_fkey, ADD CONSTRAINT artifacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE company_memos DROP CONSTRAINT IF EXISTS company_memos_created_by_fkey, ADD CONSTRAINT company_memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE event_log DROP CONSTRAINT IF EXISTS event_log_created_by_fkey, ADD CONSTRAINT event_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE approval_queue DROP CONSTRAINT IF EXISTS approval_queue_created_by_fkey, ADD CONSTRAINT approval_queue_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_created_by_fkey, ADD CONSTRAINT departments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. MULTI-TENANCY: system_config per-user overrides
-- Ensure created_by column exists
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Rebuild Primary Key to be (key, created_by)
-- Note: This is an idempotent way to ensure the PK includes the owner
DO $$
BEGIN
    -- Check if PK is just 'key' (traditional)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'system_config' AND tc.constraint_type = 'PRIMARY KEY'
        GROUP BY tc.constraint_name
        HAVING COUNT(*) = 1 AND MAX(kcu.column_name) = 'key'
    ) THEN
        ALTER TABLE system_config DROP CONSTRAINT system_config_pkey;
        ALTER TABLE system_config ADD PRIMARY KEY (key, created_by);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- If PK already exists or other error, ignore and continue
    NULL;
END $$;

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Dynamic Policies (User can only see/edit their own data)
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['goals', 'artifacts', 'company_memos', 'event_log', 'approval_queue', 'connections', 'departments']) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "User ownership" ON %I', t);
        EXECUTE format('CREATE POLICY "User ownership" ON %I FOR ALL USING (auth.uid() = created_by OR created_by IS NULL)', t);
    END LOOP;
END $$;

-- Special RLS for system_config (Users see global NULL rows OR their own rows)
DROP POLICY IF EXISTS "Config access" ON system_config;
CREATE POLICY "Config access" ON system_config FOR ALL USING (created_by = auth.uid() OR created_by IS NULL);

-- 5. REALTIME REPLICATION
-- Enable Realtime for the publication. This is required for the Zero-Poll supervisor.
-- You MUST run this in the Supabase Dashboard to ensure the publication exists.
ALTER TABLE goals REPLICA IDENTITY FULL;
ALTER TABLE goal_tasks REPLICA IDENTITY FULL;

-- Ensure publication exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables to publication idempotently
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='goals') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE goals;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='goal_tasks') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE goal_tasks;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='event_log') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE event_log;
    END IF;
END $$;

