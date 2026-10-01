-- Migration: Create company_profile table
-- Purpose: Dedicated table for company information instead of flat system_config storage
-- This enables better querying and structured company context for agents

CREATE TABLE company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  founder_name TEXT NOT NULL,
  industry TEXT,
  location TEXT,
  city TEXT,
  country TEXT,
  business_description TEXT,
  business_category TEXT,
  stage TEXT CHECK (stage IN ('starting', 'mvp', 'traction', 'scaling')),
  local_identity JSONB,
  business_model TEXT,
  target_customer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own company profile
CREATE POLICY "Users can view own company profile"
  ON company_profile
  FOR SELECT
  USING (created_by = auth.uid());

-- Policy: Users can insert their own company profile
CREATE POLICY "Users can insert own company profile"
  ON company_profile
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own company profile
CREATE POLICY "Users can update own company profile"
  ON company_profile
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Index for faster lookups by user
CREATE INDEX idx_company_profile_created_by ON company_profile(created_by);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_company_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_company_profile_updated_at
  BEFORE UPDATE ON company_profile
  FOR EACH ROW
  EXECUTE FUNCTION update_company_profile_timestamp();