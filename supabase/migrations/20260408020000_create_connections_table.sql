-- Migration: Create connections table for Nango/OAuth integrations
CREATE TABLE IF NOT EXISTS connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  connection_id TEXT, -- for Nango
  access_token TEXT,  -- DIY OAuth fallback
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(created_by, service_name) -- Ensure one connection per service per user
);

-- Enable RLS
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

-- Base policy: users can only see their own connections
CREATE POLICY "Users can view their own connections" 
ON connections FOR SELECT 
USING (auth.uid() = created_by);

CREATE POLICY "Users can manage their own connections" 
ON connections FOR ALL 
USING (auth.uid() = created_by);
