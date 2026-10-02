-- Migration: Internal Instructions table
-- Stores Tier 2 outputs: skill guides, system prompts, agent directives.
-- These are NOT artifacts — they are internal config consumed by departments/Orc.
-- Never visible in the artifact gallery.

CREATE TABLE IF NOT EXISTS internal_instructions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  category    TEXT        NOT NULL
                CHECK (category IN ('skill', 'prompt', 'directive')),
  content     TEXT        NOT NULL,
  version     TEXT        NOT NULL DEFAULT '1.0',
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION touch_internal_instructions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_internal_instructions
  BEFORE UPDATE ON internal_instructions
  FOR EACH ROW EXECUTE FUNCTION touch_internal_instructions_updated_at();

-- RLS: only service_role writes; founders can read their own
ALTER TABLE internal_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON internal_instructions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Founders read own instructions" ON internal_instructions
  FOR SELECT USING (created_by = auth.uid() OR auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_internal_instructions_slug     ON internal_instructions(slug);
CREATE INDEX IF NOT EXISTS idx_internal_instructions_category ON internal_instructions(category);
