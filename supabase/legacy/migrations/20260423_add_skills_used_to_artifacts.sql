-- Migration: Skills Layer — add skills_used column to artifacts
-- Spec §9.5: every artefact records which skill slugs were loaded when producing it.
-- This enables A/B skill improvement tracking and the DoD #5 / #6 verification checks.
--
-- Non-breaking additive migration. Existing artifact rows default to an empty array.
-- Run via: supabase db push (if using Supabase CLI) or paste into the SQL editor.
--
-- Date: 2026-04-23

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS skills_used text[] DEFAULT '{}' NOT NULL;

-- Index for querying "which artefacts used skill X" (useful for analytics and DoD checks)
CREATE INDEX IF NOT EXISTS idx_artifacts_skills_used
  ON artifacts USING GIN (skills_used);

-- Comment for schema documentation
COMMENT ON COLUMN artifacts.skills_used IS
  'Spec §9.5: slugs of skill files loaded when producing this artefact (e.g. ["pptx", "pitch_deck"]). '
  'Populated by runWorkerTask via loadSkillsForTask(). Empty array means no skill was matched.';
