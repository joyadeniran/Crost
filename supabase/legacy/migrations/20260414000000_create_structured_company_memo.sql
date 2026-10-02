-- Migration: Create Structured Company Memo Table
-- Date: 2026-04-14
-- Purpose: Implement CROST_SPEC Section 5 requirements
-- Description: Create a single-source-of-truth company memo table with proper structure

-- Create structured company_memo (singular) table
CREATE TABLE IF NOT EXISTS company_memo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Company Profile (CROST_SPEC Section 5)
  company_profile JSONB DEFAULT '{
    "name": null,
    "industry": null,
    "location": null,
    "description": null
  }'::jsonb,

  -- Business State Arrays
  active_goals JSONB[] DEFAULT '{}',
  strategies JSONB[] DEFAULT '{}',
  task_logs JSONB[] DEFAULT '{}',

  -- Artifact References (UUIDs pointing to artifacts table)
  artefact_references UUID[] DEFAULT '{}',

  -- Decisions and Department Notes
  decisions JSONB[] DEFAULT '{}',
  department_notes JSONB DEFAULT '{}'::jsonb,

  -- Metadata
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on user_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_company_memo_user_id ON company_memo(user_id);

-- Create RLS policy: Users can only see their own memo
ALTER TABLE company_memo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own company memo"
  ON company_memo FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own company memo"
  ON company_memo FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own company memo"
  ON company_memo FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add comment to document structure
COMMENT ON TABLE company_memo IS 'Single source of truth for company state per CROST_SPEC Section 5';
COMMENT ON COLUMN company_memo.company_profile IS 'Company metadata: name, industry, location, description';
COMMENT ON COLUMN company_memo.active_goals IS 'Array of active goal objects';
COMMENT ON COLUMN company_memo.strategies IS 'Array of strategy objects for current goals';
COMMENT ON COLUMN company_memo.task_logs IS 'Array of completed/in-progress task objects';
COMMENT ON COLUMN company_memo.artefact_references IS 'Array of artifact UUIDs created from department outputs';
COMMENT ON COLUMN company_memo.decisions IS 'Array of decisions made by founder or Orc';
COMMENT ON COLUMN company_memo.department_notes IS 'Object with dept_slug keys containing department-specific notes';
COMMENT ON COLUMN company_memo.updated_by IS 'User ID of last updater (agent, founder, or system)';
