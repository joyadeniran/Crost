-- Migration: Add sources (citations) column to artifacts table (Spec §9)
-- Citations are non-negotiable — every artefact must populate memo_ids, kb_file_ids, tool_calls.

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL
    DEFAULT '{"memo_ids": [], "kb_file_ids": [], "tool_calls": []}'::jsonb;

-- Backfill any rows that slipped through before DEFAULT was added
UPDATE artifacts
SET sources = '{"memo_ids": [], "kb_file_ids": [], "tool_calls": []}'::jsonb
WHERE sources IS NULL;

-- Index for querying artifacts that cite a specific memo or KB file
CREATE INDEX IF NOT EXISTS idx_artifacts_sources_memo_ids
  ON artifacts USING GIN ((sources -> 'memo_ids'));

CREATE INDEX IF NOT EXISTS idx_artifacts_sources_kb_file_ids
  ON artifacts USING GIN ((sources -> 'kb_file_ids'));
