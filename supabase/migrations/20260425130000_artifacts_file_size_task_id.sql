-- Migration: Add file_size and task_id to artifacts table
-- Date: 2026-04-25
-- Purpose: Support Artefacts Gallery v1 — display file sizes and lineage tracking

-- 1. Add file_size column (bytes) for display in UI
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS file_size INTEGER;

COMMENT ON COLUMN artifacts.file_size IS
  'Size of the artifact file in bytes. Populated at creation time from the uploaded blob.';

-- 2. Add task_id column for lineage tracking (Goal → Task → Artefact)
ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS task_id UUID;

COMMENT ON COLUMN artifacts.task_id IS
  'FK to goal_tasks.task_id — links artifact to the specific task that produced it. Enables lineage view.';

-- 3. Index for fast lineage lookups
CREATE INDEX IF NOT EXISTS idx_artifacts_task_id
  ON artifacts(task_id) WHERE task_id IS NOT NULL;

-- 4. Index for analytics / storage usage queries
CREATE INDEX IF NOT EXISTS idx_artifacts_file_size
  ON artifacts(file_size) WHERE file_size IS NOT NULL;
