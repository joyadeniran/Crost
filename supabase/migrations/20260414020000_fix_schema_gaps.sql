-- Migration: 20260414020000_fix_schema_gaps.sql
-- Fixes structural gaps exposed by the memos/artifacts CROST_SPEC compliance fix.
-- Must be run AFTER 20260414_create_structured_company_memo.sql

-- ============================================================
-- 1. ARTIFACTS — Add file_url column (CROST_SPEC Section 6)
-- ============================================================
-- Original migration 010 had only `body TEXT`.
-- Fixed routes now require file_url pointing to Supabase Storage.
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Add comment to document intent
COMMENT ON COLUMN artifacts.file_url IS 'URL of the file in Supabase Storage. CROST_SPEC Section 6: DB stores metadata only, not file body.';
COMMENT ON COLUMN artifacts.body IS 'DEPRECATED: Do not write to this column. Use file_url instead.';

-- ============================================================
-- 2. COMPANY_MEMOS — Add missing columns used by fixed endpoints
-- ============================================================
-- The fixed task + worker endpoints insert source_type, confidence,
-- metadata, and task_id — none of which exist in the original schema.
ALTER TABLE company_memos
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'agent'
    CHECK (source_type IN ('agent', 'founder', 'system')),
  ADD COLUMN IF NOT EXISTS confidence NUMERIC(3,2) DEFAULT 0.8
    CHECK (confidence BETWEEN 0.0 AND 1.0),
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS task_id TEXT;

COMMENT ON COLUMN company_memos.source_type IS 'Who produced this memo: agent, founder, or system.';
COMMENT ON COLUMN company_memos.confidence IS 'Agent confidence in this memo content (0.0–1.0).';
COMMENT ON COLUMN company_memos.metadata IS 'Arbitrary metadata: toolName, taskId, artifactId, etc.';
COMMENT ON COLUMN company_memos.task_id IS 'Optional reference to the task that produced this memo.';

-- ============================================================
-- 3. ARTIFACTS — Ensure company_memo (singular) table exists
-- ============================================================
-- This is a guard in case the 20260414_create_structured_company_memo.sql
-- migration was not yet run. Run that migration first if this fails.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'company_memo'
  ) THEN
    RAISE EXCEPTION
      'company_memo table does not exist. Run 20260414_create_structured_company_memo.sql first.';
  END IF;
END $$;

-- ============================================================
-- 4. INDEXES — New columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_memos_source_type ON company_memos(source_type);
CREATE INDEX IF NOT EXISTS idx_memos_task_id ON company_memos(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_file_url ON artifacts(file_url) WHERE file_url IS NOT NULL;
