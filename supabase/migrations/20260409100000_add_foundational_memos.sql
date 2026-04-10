-- Migration: Add foundational memos support
-- Purpose: Add is_foundational column for foundational memos
-- Foundational memos are auto-generated from company_profile and always included in context
-- Note: created_by already exists from previous migration

-- Add is_foundational column
ALTER TABLE company_memos
  ADD COLUMN is_foundational BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster foundational memo queries
CREATE INDEX idx_memos_foundational ON company_memos(is_foundational) WHERE is_foundational = true;

-- Enable RLS on company_memos
ALTER TABLE company_memos ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own memos and foundational memos
CREATE POLICY "Users can view own memos"
  ON company_memos
  FOR SELECT
  USING (created_by = auth.uid() OR is_foundational = true);

-- Policy: Users can insert their own memos
CREATE POLICY "Users can insert own memos"
  ON company_memos
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- Policy: Users can update their own memos (not foundational ones)
CREATE POLICY "Users can update own memos"
  ON company_memos
  FOR UPDATE
  USING (created_by = auth.uid() AND is_foundational = false)
  WITH CHECK (created_by = auth.uid() AND is_foundational = false);

-- Policy: Users can delete their own memos (not foundational ones)
CREATE POLICY "Users can delete own memos"
  ON company_memos
  FOR DELETE
  USING (created_by = auth.uid() AND is_foundational = false);