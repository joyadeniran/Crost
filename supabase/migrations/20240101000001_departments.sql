-- Migration 001: Departments
-- Core table for all Crost department agents

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) >= 2 AND length(slug) <= 50),

  -- Activation lifecycle (Anthropic RSP-inspired: draft → review → active)
  activation_stage TEXT NOT NULL DEFAULT 'draft'
    CHECK (activation_stage IN ('draft', 'review', 'active', 'paused', 'deprecated')),

  -- Prompt & persona
  persona_prompt TEXT NOT NULL CHECK (length(persona_prompt) >= 50),
  tone_override TEXT,                        -- Optional dept-level tone; merged with local_identity

  -- Capability declaration (Anthropic model-card-inspired)
  capabilities JSONB NOT NULL DEFAULT '[]', -- e.g. ["draft_emails", "research_contacts"]
  restrictions JSONB NOT NULL DEFAULT '[]', -- e.g. ["cannot_send_email"]

  -- Model routing
  model_provider TEXT NOT NULL DEFAULT 'local'
    CHECK (model_provider IN ('local', 'gemini', 'claude', 'groq')),
  model_name TEXT NOT NULL DEFAULT 'local/gemma3',

  -- Tools (array of available_tools IDs assigned to this department)
  tools JSONB NOT NULL DEFAULT '[]',

  -- Runtime state
  status TEXT NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'awaiting_approval', 'error', 'paused')),
  current_task TEXT,
  last_active_at TIMESTAMPTZ,

  -- Onyx integration
  onyx_persona_id TEXT UNIQUE,               -- Set after Onyx persona creation; NULL = not yet synced

  -- Metadata
  icon TEXT DEFAULT 'briefcase',             -- Lucide icon name
  color TEXT DEFAULT '#6366f1',             -- Hex color for department badge
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT                            -- user ID of founder who created it
);

-- Reserved slugs — these cannot be used by user-created departments
-- (they are used by system routes)
CREATE OR REPLACE FUNCTION check_reserved_slugs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IN (
    'system', 'admin', 'api', 'memos', 'approvals',
    'settings', 'onboarding', 'health', 'toggle', 'status'
  ) THEN
    RAISE EXCEPTION 'Slug "%" is reserved by Crost and cannot be used.', NEW.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER departments_reserved_slugs
  BEFORE INSERT OR UPDATE OF slug ON departments
  FOR EACH ROW EXECUTE FUNCTION check_reserved_slugs();

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
