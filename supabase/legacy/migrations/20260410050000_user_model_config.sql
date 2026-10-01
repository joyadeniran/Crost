-- Migration: User API Keys & Model Assignments

CREATE TABLE user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'gemini', 'claude', 'groq'
  encrypted_key TEXT NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(created_by, provider)
);

CREATE TABLE user_model_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'reasoning', 'execution', 'utility'
  model_name TEXT NOT NULL,
  provider TEXT NOT NULL, -- 'gemini', 'claude', 'groq'
  preset_config TEXT, -- 'budget', 'fast', 'premium'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(created_by, role)
);

-- RLS for user_api_keys
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_api_keys_own ON user_api_keys
  FOR ALL USING (auth.uid() = created_by);

-- RLS for user_model_assignments
ALTER TABLE user_model_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_model_assignments_own ON user_model_assignments
  FOR ALL USING (auth.uid() = created_by);

-- Indexes
CREATE INDEX idx_user_api_keys_provider ON user_api_keys(created_by, provider);
CREATE INDEX idx_user_model_assignments_role ON user_model_assignments(created_by, role);
