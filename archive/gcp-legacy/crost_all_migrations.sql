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
-- Migration 002: Approval Queue
-- Human-in-the-loop gate for all irreversible department actions

CREATE TABLE approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  department_name TEXT NOT NULL,             -- Denormalized; updated via trigger on dept rename
  department_slug TEXT NOT NULL,            -- Denormalized; for routing without JOIN
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'send_email', 'post_social', 'send_message', 'merge_code',
      'spend_budget', 'create_document', 'run_query', 'delete_data',
      'external_api_call', 'other'
    )),
  action_label TEXT NOT NULL,               -- Human-readable description
  payload JSONB NOT NULL,                   -- The action data to execute on approval
  context TEXT,                             -- Why the department is requesting this
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  execution_result JSONB,
  retry_count INTEGER DEFAULT 0            -- Track re-execution attempts
);

-- Keep department_name/slug in sync if a department is renamed
CREATE OR REPLACE FUNCTION sync_approval_department_name()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name != NEW.name OR OLD.slug != NEW.slug THEN
    UPDATE approval_queue
    SET department_name = NEW.name, department_slug = NEW.slug
    WHERE department_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_approvals_on_dept_rename
  AFTER UPDATE OF name, slug ON departments
  FOR EACH ROW EXECUTE FUNCTION sync_approval_department_name();

CREATE INDEX idx_approval_queue_status ON approval_queue(status);
CREATE INDEX idx_approval_queue_department ON approval_queue(department_id);
CREATE INDEX idx_approval_queue_expires ON approval_queue(expires_at) WHERE status = 'pending';
-- Migration 003: Company Memos
-- Cross-department knowledge sharing system

CREATE TABLE company_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_department TEXT NOT NULL,             -- Slug (denormalized; survives dept rename via trigger)
  from_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',                  -- Routing mechanism: ['all'], ['engineering'], etc.
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  onyx_index_id TEXT,                        -- NULL = not yet indexed in Vespa
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_by TEXT[] DEFAULT '{}'               -- Array of department slugs that have read this memo
);

-- Keep from_department slug in sync on rename
CREATE OR REPLACE FUNCTION sync_memo_department_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.slug != NEW.slug THEN
    UPDATE company_memos
    SET from_department = NEW.slug
    WHERE from_department = OLD.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_memos_on_dept_rename
  AFTER UPDATE OF slug ON departments
  FOR EACH ROW EXECUTE FUNCTION sync_memo_department_slug();

CREATE INDEX idx_memos_tags ON company_memos USING GIN(tags);
CREATE INDEX idx_memos_from_department ON company_memos(from_department);
CREATE INDEX idx_memos_priority ON company_memos(priority) WHERE priority IN ('high', 'urgent');
-- Migration 004: Event Log
-- Immutable audit trail for all agent actions

CREATE TABLE event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT,                      -- Denormalized; survives dept deletion
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'task_started', 'task_completed', 'task_failed',
      'approval_requested', 'approval_approved', 'approval_rejected',
      'approval_expired', 'action_executed', 'action_execution_failed',
      'memo_written', 'tool_called', 'unauthorised_tool_call',
      'error', 'mode_switched', 'token_limit_hit',
      'department_created', 'department_updated', 'department_activated',
      'department_paused', 'department_deprecated', 'department_deleted',
      'model_pulled', 'constitution_updated'
    )),
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  model_used TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_department ON event_log(department_slug);
CREATE INDEX idx_event_log_created_at ON event_log(created_at DESC);
CREATE INDEX idx_event_log_event_type ON event_log(event_type);
-- Migration 005: System Config
-- Global configuration and the Crost Constitution

CREATE TABLE system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  is_founder_editable BOOLEAN NOT NULL DEFAULT true,  -- false = Crost internal only
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_config (key, value, is_founder_editable) VALUES
  ('env_mode', '"local"', true),
  ('token_hard_limit_per_session', '50000', true),
  ('auto_fallback_to_local_on_limit', 'true', true),

  -- Founder-configured at onboarding; no default
  ('local_identity', 'null', true),

  -- The Crost Constitution — founder can ADD clauses, but never remove core ones
  ('agent_constitution', '"CROST AGENT CONSTITUTION — These rules apply to every department, always.\n\n1. NEVER take an irreversible action (send, post, merge, spend, delete) without explicit founder approval via the Approval Feed.\n2. NEVER fabricate data, metrics, quotes, or facts. If you do not know something, say so clearly.\n3. NEVER expose credentials, API keys, personal data, or financial figures to unauthorised parties.\n4. NEVER make commitments on behalf of the founder without explicit approval — not even tentative ones.\n5. ALWAYS check company_memos before starting a task that could conflict with another department''s work.\n6. ALWAYS surface uncertainty. If a task is ambiguous, ask a clarifying question before acting.\n7. ALWAYS write to the event_log when starting or completing a task, and when encountering an error.\n8. You are a department head, not an autonomous agent. The founder is the CEO. Behave accordingly."', false),

  -- Source of truth for what tools can be assigned to departments
  ('available_tools', '["github", "gmail", "slack", "supabase_query", "apollo_mcp", "web_search", "file_reader"]', false),

  -- Maps local model names to cloud equivalents for mode switching
  ('local_to_cloud_map', '{"local/gemma3": "cloud/gemini-pro", "local/gemma3-lite": "cloud/gemini-pro", "local/llama3": "cloud/gemini-pro", "local/mistral": "cloud/groq-llama"}', false);

-- Prevent deletion of system config rows (use UPDATE instead)
CREATE OR REPLACE FUNCTION prevent_system_config_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'system_config rows cannot be deleted. Use UPDATE instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_system_config
  BEFORE DELETE ON system_config
  FOR EACH ROW EXECUTE FUNCTION prevent_system_config_deletion();
-- Migration 006: Available Tools Registry
-- Defines all tools that can be assigned to departments.
-- Prevents departments from requesting tools that don't exist or aren't configured.

CREATE TABLE available_tools (
  id TEXT PRIMARY KEY,                       -- e.g. 'github', 'gmail'
  label TEXT NOT NULL,                       -- Display name: 'GitHub'
  description TEXT NOT NULL,                -- What this tool does
  requires_config BOOLEAN DEFAULT true,     -- Does it need an API key/OAuth?
  is_configured BOOLEAN DEFAULT false,      -- Set to true when connector is set up
  onyx_connector_id TEXT,                   -- Onyx internal connector ID
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
);

INSERT INTO available_tools (id, label, description, requires_config, risk_level) VALUES
  ('github',        'GitHub',         'Read repos, create PRs, review code',                true,  'high'),
  ('gmail',         'Gmail',          'Read and draft emails',                               true,  'high'),
  ('slack',         'Slack',          'Post messages and read channels',                     true,  'medium'),
  ('supabase_query','Database Query', 'Read-only queries against the app database',          true,  'medium'),
  ('apollo_mcp',    'Apollo.io',      'Contact research and outreach sequences',             true,  'medium'),
  ('web_search',    'Web Search',     'Search the web for research',                         false, 'low'),
  ('file_reader',   'File Reader',    'Read uploaded documents and files',                   false, 'low');

-- Realtime subscriptions to enable (run in Supabase Dashboard):
-- departments      — for live status updates in DepartmentCards
-- approval_queue   — for new approval notifications
-- Migration 007: Goals
-- Orchestrator plan storage and tracking
CREATE TABLE goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  founder_input TEXT NOT NULL,
  orchestrator_plan JSONB,
  risk_note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','planning','awaiting_approval','executing','completed','failed')),
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Migration 008: Artifacts
-- Substantial work outputs (images, docs, code) generated by departments
CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('image', 'document', 'code', 'data', 'spreadsheet')),
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB DEFAULT '{}',
  preview_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_artifacts_goal ON artifacts(goal_id);
CREATE INDEX idx_artifacts_dept ON artifacts(department_slug);
CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);

-- Realtime subscriptions (add to Dashboard):
-- goals
-- artifacts
