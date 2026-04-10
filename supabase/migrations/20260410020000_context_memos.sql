-- Migration: 20260410020000_context_memos.sql
-- Adds valid_until and version_tag to company_memos to enable "Context Sync" for workers.

ALTER TABLE company_memos 
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_memos_valid_until ON company_memos(valid_until);
CREATE INDEX IF NOT EXISTS idx_memos_version_tag ON company_memos(version_tag);

COMMENT ON COLUMN company_memos.valid_until IS 'The expiration timestamp for this context memo. Workers should ignore expired memos.';
COMMENT ON COLUMN company_memos.version_tag IS 'A versioning tag to distinguish between different batches of context (e.g., goal_iteration_1).';
