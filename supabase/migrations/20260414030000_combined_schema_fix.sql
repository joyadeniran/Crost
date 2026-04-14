-- ============================================================
-- CROST SCHEMA FIX — Run this in the Supabase SQL Editor
-- https://supabase.com/dashboard/project/vgktzhlfpaetgiqjpnbu/sql/new
-- ============================================================
-- Combines:
--   1. 20260414_create_structured_company_memo.sql
--   2. 20260414020000_fix_schema_gaps.sql
-- ============================================================

-- ============================================================
-- PART 1: Create company_memo (singular) structured table
-- Per CROST_SPEC Section 5
-- ============================================================

CREATE TABLE IF NOT EXISTS company_memo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  company_profile JSONB DEFAULT '{
    "name": null,
    "industry": null,
    "location": null,
    "description": null
  }'::jsonb,

  active_goals JSONB[] DEFAULT '{}',
  strategies   JSONB[] DEFAULT '{}',
  task_logs    JSONB[] DEFAULT '{}',

  artefact_references UUID[] DEFAULT '{}',

  decisions        JSONB[] DEFAULT '{}',
  department_notes JSONB   DEFAULT '{}'::jsonb,

  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_memo_user_id ON company_memo(user_id);

ALTER TABLE company_memo ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_memo' AND policyname = 'Users can read their own company memo'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can read their own company memo"
      ON company_memo FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_memo' AND policyname = 'Users can update their own company memo'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update their own company memo"
      ON company_memo FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_memo' AND policyname = 'Users can insert their own company memo'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert their own company memo"
      ON company_memo FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

COMMENT ON TABLE company_memo IS 'Single source of truth for company state per CROST_SPEC Section 5';

-- ============================================================
-- PART 2: Fix artifacts table — add file_url column
-- Per CROST_SPEC Section 6: DB stores metadata only
-- ============================================================

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS file_url    TEXT,
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

COMMENT ON COLUMN artifacts.file_url IS 'URL to file in Supabase Storage. Required per CROST_SPEC Section 6.';
COMMENT ON COLUMN artifacts.body     IS 'DEPRECATED — use file_url instead.';

CREATE INDEX IF NOT EXISTS idx_artifacts_file_url
  ON artifacts(file_url) WHERE file_url IS NOT NULL;

-- ============================================================
-- PART 3: Fix company_memos table — add missing columns
-- The fixed task/worker endpoints insert these fields
-- ============================================================

ALTER TABLE company_memos
  ADD COLUMN IF NOT EXISTS source_type TEXT    DEFAULT 'agent'
    CHECK (source_type IN ('agent', 'founder', 'system')),
  ADD COLUMN IF NOT EXISTS confidence  NUMERIC(3,2) DEFAULT 0.8
    CHECK (confidence BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS metadata    JSONB   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS task_id     TEXT;

CREATE INDEX IF NOT EXISTS idx_memos_source_type
  ON company_memos(source_type);
CREATE INDEX IF NOT EXISTS idx_memos_task_id
  ON company_memos(task_id) WHERE task_id IS NOT NULL;

-- ============================================================
-- DONE — Verify
-- ============================================================
SELECT
  (SELECT COUNT(*) FROM information_schema.tables
    WHERE table_name = 'company_memo')    AS company_memo_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'artifacts' AND column_name = 'file_url') AS artifacts_file_url_exists,
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_name = 'company_memos' AND column_name = 'source_type') AS memos_source_type_exists;
