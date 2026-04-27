-- FIX: Missing tool_executions table & Schema Cache Reload
-- Run this in your Supabase SQL Editor.

-- 1. Create the unified connections table (if it doesn't exist)
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_slug TEXT,
  composio_connection_id TEXT NOT NULL,
  composio_entity_id TEXT,
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  metadata JSONB,
  UNIQUE(user_id, tool_slug)
);

-- 2. Create the tool_executions table for audit and HITL tracking (if it doesn't exist)
CREATE TABLE IF NOT EXISTS tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID, 
  task_id UUID,
  department_slug TEXT,
  tool_slug TEXT,
  action TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'blocked')),
  risk TEXT DEFAULT 'low' CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  requires_approval BOOLEAN DEFAULT false,
  approval_id UUID, -- Keeping loose reference to prevent circular dependency issues
  result_summary TEXT,
  raw_result JSONB,
  artefact_id UUID, -- Keeping loose reference
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

-- 4. Base Policies (using DO blocks to prevent 'policy already exists' errors)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own connections') THEN
        CREATE POLICY "Users can view their own connections" ON connections FOR SELECT USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own connections') THEN
        CREATE POLICY "Users can manage their own connections" ON connections FOR ALL USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view their own tool executions') THEN
        CREATE POLICY "Users can view their own tool executions" ON tool_executions FOR SELECT USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'System can manage tool executions') THEN
        CREATE POLICY "System can manage tool executions" ON tool_executions FOR ALL USING (auth.uid() = user_id);
    END IF;
END
$$;

-- 5. FORCE SCHEMA CACHE RELOAD
-- This tells Supabase API to instantly recognise the newly created tables
NOTIFY pgrst, reload schema;
