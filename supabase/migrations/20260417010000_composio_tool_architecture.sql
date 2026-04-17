-- Migration: Composio Tool Architecture
-- Redefines connections and adds tool_executions per implementation plan v9.0

-- 1. Drop the legacy nango-centric connections table
DROP TABLE IF EXISTS connections;

-- 2. Create the unified connections table linked to available_tools
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_slug TEXT REFERENCES available_tools(id) ON DELETE CASCADE,
  composio_connection_id TEXT NOT NULL,
  composio_entity_id TEXT,
  status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'revoked')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  metadata JSONB,
  UNIQUE(user_id, tool_slug)
);

-- 3. Create the tool_executions table for audit and HITL tracking
CREATE TABLE tool_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID, -- Optional foreign key if goals table is strictly enforced, keeping soft for flexibility
  task_id UUID,
  department_slug TEXT,
  tool_slug TEXT REFERENCES available_tools(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  params JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'blocked')),
  risk TEXT DEFAULT 'low' CHECK (risk IN ('low', 'medium', 'high', 'critical')),
  requires_approval BOOLEAN DEFAULT false,
  approval_id UUID REFERENCES approval_queue(id) ON DELETE SET NULL,
  result_summary TEXT,
  raw_result JSONB,
  artefact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Note: available_tools uses 'id' as the slug historically (e.g. 'gmail', 'github')

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_executions ENABLE ROW LEVEL SECURITY;

-- Base Policies
CREATE POLICY "Users can view their own connections" ON connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own connections" ON connections FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own tool executions" ON tool_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can manage tool executions" ON tool_executions FOR ALL USING (auth.uid() = user_id);
