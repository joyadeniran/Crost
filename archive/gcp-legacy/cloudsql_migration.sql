-- =============================================================================
-- CROST CLOUD SQL MIGRATION — PRODUCTION SCHEMA
-- Target: Google Cloud SQL PostgreSQL 15
-- Generated: 2026-06-04
-- Notes:
--   • NO auth.users references (Firebase UIDs are TEXT, not Supabase UUIDs)
--   • NO RLS policies — security handled at the application layer
--   • created_by is TEXT throughout (Firebase UID format: "XyZ123abc")
--   • user_id is TEXT throughout where it previously referenced auth.users
--   • pgvector enabled for knowledge base embeddings
--   • Includes all columns from migrations through 20260518
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- SHARED UTILITY FUNCTIONS
-- (defined once; reused by multiple triggers below)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- TABLE: departments
-- ---------------------------------------------------------------------------
CREATE TABLE departments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL UNIQUE,
  slug              TEXT        NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9-]+$' AND length(slug) >= 2 AND length(slug) <= 50),

  -- Activation lifecycle (draft → review → active)
  activation_stage  TEXT        NOT NULL DEFAULT 'draft'
    CHECK (activation_stage IN ('draft', 'review', 'active', 'paused', 'deprecated')),

  -- Prompt & persona
  persona_prompt    TEXT        NOT NULL CHECK (length(persona_prompt) >= 50),
  tone_override     TEXT,

  -- Capability declaration
  capabilities      JSONB       NOT NULL DEFAULT '[]',
  restrictions      JSONB       NOT NULL DEFAULT '[]',

  -- Model routing
  model_provider    TEXT        NOT NULL DEFAULT 'local'
    CHECK (model_provider IN ('local', 'gemini', 'claude', 'groq')),
  model_name        TEXT        NOT NULL DEFAULT 'local/gemma3',

  -- Tools
  tools             JSONB       NOT NULL DEFAULT '[]',

  -- Runtime state
  status            TEXT        NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'running', 'awaiting_approval', 'error', 'paused')),
  current_task      TEXT,
  last_active_at    TIMESTAMPTZ,

  -- Onyx integration
  onyx_persona_id   TEXT        UNIQUE,

  -- Metadata
  icon              TEXT        DEFAULT 'briefcase',
  color             TEXT        DEFAULT '#6366f1',

  -- Ownership (TEXT = Firebase UID)
  created_by        TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reserved slugs guard
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

CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: goals
-- ---------------------------------------------------------------------------
CREATE TABLE goals (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                       TEXT        NOT NULL,
  founder_input               TEXT        NOT NULL,
  orchestrator_plan           JSONB,
  risk_note                   TEXT,
  status                      TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed')),
  outcome                     TEXT,

  -- Orc supervision fields (from orc_upgrade migration)
  env_mode_snapshot           TEXT,
  orc_session_id              TEXT,
  last_status_check           TIMESTAMPTZ,
  supervision_interval_seconds INTEGER     NOT NULL DEFAULT 30,

  -- Response mode (from goals_response_mode migration)
  response_mode               TEXT
    CHECK (response_mode IN ('assistant', 'clarify', 'quick_plan', 'full_plan', 'direct_action', 'command', 'escalate')),
  orc_decision                JSONB,

  -- ADK pipeline routing
  pipeline                    TEXT        NOT NULL DEFAULT 'standard',

  -- Ownership (TEXT = Firebase UID)
  created_by                  TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_status        ON goals(status);
CREATE INDEX idx_goals_created_at    ON goals(created_at DESC);
CREATE INDEX idx_goals_created_by    ON goals(created_by);
CREATE INDEX idx_goals_response_mode ON goals(response_mode) WHERE response_mode IS NOT NULL;

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: goal_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE goal_tasks (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id       UUID        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  task_id       TEXT        NOT NULL,
  dept_slug     TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  label         TEXT        NOT NULL,
  reasoning     TEXT        NOT NULL DEFAULT '',
  params        JSONB       NOT NULL DEFAULT '{}',
  risk_level    TEXT        NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  depends_on    TEXT[]      NOT NULL DEFAULT '{}',
  model         TEXT        NOT NULL DEFAULT 'groq/llama-3.3-70b-versatile',
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'planned',
      'approved',
      'pending_dependency',
      'dispatched',
      'running',
      'completed',
      'failed',
      'rejected',
      'skipped',
      'expired',
      'needs_data'
    )),
  assigned_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  orc_notes     JSONB       NOT NULL DEFAULT '[]',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: task_id unique per goal
  CONSTRAINT goal_tasks_unique_task_per_goal UNIQUE (goal_id, task_id)
);

CREATE INDEX idx_goal_tasks_goal_id  ON goal_tasks(goal_id);
CREATE INDEX idx_goal_tasks_status   ON goal_tasks(status);
CREATE INDEX idx_goal_tasks_dept_slug ON goal_tasks(dept_slug);

CREATE TRIGGER goal_tasks_updated_at
  BEFORE UPDATE ON goal_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: approval_queue
-- ---------------------------------------------------------------------------
CREATE TABLE approval_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id    UUID        NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  department_name  TEXT        NOT NULL,
  department_slug  TEXT        NOT NULL,
  action_type      TEXT        NOT NULL
    CHECK (action_type IN (
      'send_email', 'post_social', 'send_message', 'merge_code',
      'spend_budget', 'create_document', 'run_query', 'delete_data',
      'external_api_call', 'other'
    )),
  action_label     TEXT        NOT NULL,
  payload          JSONB       NOT NULL,
  context          TEXT,
  risk_level       TEXT        NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired', 'failed')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at       TIMESTAMPTZ,
  decided_by       TEXT,
  expires_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  execution_result JSONB,
  retry_count      INTEGER     DEFAULT 0,

  -- Goal linkage (from orc_upgrade migration)
  goal_id          UUID        REFERENCES goals(id) ON DELETE SET NULL,
  reasoning        TEXT,

  -- Ownership (TEXT = Firebase UID)
  created_by       TEXT
);

-- Keep department_name/slug in sync on dept rename
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

CREATE INDEX idx_approval_queue_status   ON approval_queue(status);
CREATE INDEX idx_approval_queue_department ON approval_queue(department_id);
CREATE INDEX idx_approval_queue_expires  ON approval_queue(expires_at) WHERE status = 'pending';
CREATE INDEX idx_approval_queue_pending_expired ON approval_queue(expires_at) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- TABLE: company_memos
-- ---------------------------------------------------------------------------
CREATE TABLE company_memos (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_department         TEXT        NOT NULL,
  from_department_id      UUID        REFERENCES departments(id) ON DELETE SET NULL,
  title                   TEXT        NOT NULL,
  body                    TEXT        NOT NULL,
  tags                    TEXT[]      DEFAULT '{}',
  priority                TEXT        NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  onyx_index_id           TEXT,
  read_by                 TEXT[]      DEFAULT '{}',

  -- Goal linkage (from memo_goal_id migration)
  goal_id                 UUID        REFERENCES goals(id) ON DELETE CASCADE,

  -- Provenance & trust model (from orc_upgrade migration)
  source_type             TEXT        NOT NULL DEFAULT 'agent'
    CHECK (source_type IN ('founder', 'agent', 'orchestrator', 'external', 'system')),
  confidence              FLOAT       NOT NULL DEFAULT 0.5
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  based_on                TEXT[]      NOT NULL DEFAULT '{}',
  confidence_decay_days   INTEGER     NOT NULL DEFAULT 90,

  -- Ownership (TEXT = Firebase UID)
  created_by              TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE INDEX idx_memos_tags           ON company_memos USING GIN(tags);
CREATE INDEX idx_memos_from_department ON company_memos(from_department);
CREATE INDEX idx_memos_priority        ON company_memos(priority) WHERE priority IN ('high', 'urgent');
CREATE INDEX idx_memos_goal_id         ON company_memos(goal_id);
CREATE INDEX idx_memos_confidence      ON company_memos(confidence, created_at DESC);
CREATE INDEX idx_memos_source_type     ON company_memos(source_type);

-- ---------------------------------------------------------------------------
-- TABLE: event_log
-- ---------------------------------------------------------------------------
CREATE TABLE event_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id   UUID        REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT,
  event_type      TEXT        NOT NULL
    CHECK (event_type IN (
      'task_started', 'task_completed', 'task_failed',
      'approval_requested', 'approval_approved', 'approval_rejected',
      'approval_expired', 'action_executed', 'action_execution_failed',
      'memo_written', 'tool_called', 'unauthorised_tool_call',
      'error', 'mode_switched', 'token_limit_hit',
      'department_created', 'department_updated', 'department_activated',
      'department_paused', 'department_deprecated', 'department_deleted',
      'model_pulled', 'constitution_updated', 'artifact_created',
      'orc_status_check', 'orc_rebalance', 'orc_escalation', 'orc_stall_detected',
      'goal_closed', 'goal_mission_report_written', 'goal_received',
      'plan_drafted', 'plan_approved',
      'token_budget_blocked'
    )),
  description     TEXT        NOT NULL,
  metadata        JSONB       DEFAULT '{}',
  tokens_used     INTEGER     DEFAULT 0,
  model_used      TEXT,

  -- Goal linkage (from orc_upgrade migration)
  goal_id         UUID        REFERENCES goals(id) ON DELETE SET NULL,

  -- Error code (from event_log_error_code migration)
  error_code      TEXT,

  -- ADK source tag
  source          TEXT        DEFAULT 'adk_agent',

  -- Ownership (TEXT = Firebase UID)
  created_by      TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_department ON event_log(department_slug);
CREATE INDEX idx_event_log_created_at ON event_log(created_at DESC);
CREATE INDEX idx_event_log_event_type  ON event_log(event_type);
CREATE INDEX idx_event_log_error_code  ON event_log(error_code) WHERE error_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: system_config
-- ---------------------------------------------------------------------------
CREATE TABLE system_config (
  key                 TEXT        NOT NULL,
  value               JSONB       NOT NULL,
  is_founder_editable BOOLEAN     NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- created_by TEXT: NULL = global config; set = per-user override
  created_by          TEXT,
  PRIMARY KEY (key, created_by)
  -- Note: NULL created_by records use a workaround — see seed inserts below
);

-- Prevent deletion of system_config rows
CREATE OR REPLACE FUNCTION prevent_system_config_deletion()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'system_config rows cannot be deleted. Use UPDATE instead.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_delete_system_config
  BEFORE DELETE ON system_config
  FOR EACH ROW EXECUTE FUNCTION prevent_system_config_deletion();

-- Global seed rows (created_by = '__global__' sentinel for NOT NULL PK)
-- Application layer must treat '__global__' as the system default.
INSERT INTO system_config (key, value, is_founder_editable, created_by) VALUES
  ('env_mode',                        '"local"',   true,  '__global__'),
  ('token_hard_limit_per_session',    '50000',     true,  '__global__'),
  ('auto_fallback_to_local_on_limit', 'true',      true,  '__global__'),
  ('local_identity',                  'null',      true,  '__global__'),
  ('agent_constitution',
   '"CROST AGENT CONSTITUTION — These rules apply to every department, always.\n\n1. NEVER take an irreversible action (send, post, merge, spend, delete) without explicit founder approval via the Approval Feed.\n2. NEVER fabricate data, metrics, quotes, or facts. If you do not know something, say so clearly.\n3. NEVER expose credentials, API keys, personal data, or financial figures to unauthorised parties.\n4. NEVER make commitments on behalf of the founder without explicit approval — not even tentative ones.\n5. ALWAYS check company_memos before starting a task that could conflict with another department''s work.\n6. ALWAYS surface uncertainty. If a task is ambiguous, ask a clarifying question before acting.\n7. ALWAYS write to the event_log when starting or completing a task, and when encountering an error.\n8. You are a department head, not an autonomous agent. The founder is the CEO. Behave accordingly."',
   false, '__global__'),
  ('available_tools',
   '["github", "gmail", "slack", "supabase_query", "apollo_mcp", "web_search", "file_reader"]',
   false, '__global__'),
  ('local_to_cloud_map',
   '{"local/gemma3": "cloud/gemini-pro", "local/gemma3-lite": "cloud/gemini-pro", "local/llama3": "cloud/gemini-pro", "local/mistral": "cloud/groq-llama"}',
   false, '__global__')
ON CONFLICT (key, created_by) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE: available_tools
-- ---------------------------------------------------------------------------
CREATE TABLE available_tools (
  id              TEXT        PRIMARY KEY,
  label           TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  requires_config BOOLEAN     DEFAULT true,
  is_configured   BOOLEAN     DEFAULT false,
  onyx_connector_id TEXT,
  risk_level      TEXT        NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical'))
);

INSERT INTO available_tools (id, label, description, requires_config, risk_level) VALUES
  ('github',         'GitHub',          'Read repos, create PRs, review code',                true,  'high'),
  ('gmail',          'Gmail',           'Read and draft emails',                               true,  'high'),
  ('slack',          'Slack',           'Post messages and read channels',                     true,  'medium'),
  ('supabase_query', 'Database Query',  'Read-only queries against the app database',          true,  'medium'),
  ('apollo_mcp',     'Apollo.io',       'Contact research and outreach sequences',             true,  'medium'),
  ('web_search',     'Web Search',      'Search the web for research',                         false, 'low'),
  ('file_reader',    'File Reader',     'Read uploaded documents and files',                   false, 'low')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE: artifacts
-- ---------------------------------------------------------------------------
CREATE TABLE artifacts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID        REFERENCES goals(id) ON DELETE SET NULL,
  department_id   UUID        REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT        NOT NULL,
  artifact_type   TEXT        NOT NULL
    CHECK (artifact_type IN ('image', 'document', 'code', 'data', 'spreadsheet')),
  title           TEXT        NOT NULL,
  body            TEXT,
  metadata        JSONB       DEFAULT '{}',
  preview_url     TEXT,

  -- Artifact lifecycle (from artifact_lifecycle migration)
  status          TEXT        NOT NULL DEFAULT 'review'
    CHECK (status IN ('draft', 'review', 'active', 'paused', 'deprecated', 'discarded')),
  version         INTEGER     NOT NULL DEFAULT 1,
  published_at    TIMESTAMPTZ,
  -- approved_by is TEXT = Firebase UID (not UUID ref to auth.users)
  approved_by     TEXT,

  -- Citations / sources (from add_sources_to_artifacts)
  sources         JSONB       NOT NULL DEFAULT '{"memo_ids": [], "kb_file_ids": [], "tool_calls": []}',

  -- Skills tracking (from add_skills_used_to_artifacts)
  skills_used     TEXT[]      NOT NULL DEFAULT '{}',

  -- File metadata (from artifacts_file_size_task_id)
  file_size       INTEGER,
  file_url        TEXT,
  task_id         UUID,

  -- Suggested actions reference
  suggested_actions UUID[]    DEFAULT '{}',

  -- Ownership (TEXT = Firebase UID)
  created_by      TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Artifact status transition enforcer
CREATE OR REPLACE FUNCTION enforce_artifact_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('active', 'paused', 'deprecated') AND NEW.status = 'discarded' THEN
    RAISE EXCEPTION
      'Cannot discard a published artifact (status=%). Use deprecated instead.', OLD.status;
  END IF;

  IF OLD.status IN ('draft', 'review') AND NEW.status = 'deprecated' THEN
    RAISE EXCEPTION
      'Cannot deprecate an unpublished artifact (status=%). Use discarded instead.', OLD.status;
  END IF;

  IF OLD.status = 'active' AND NEW.status = 'active' THEN
    IF (OLD.title    IS DISTINCT FROM NEW.title    OR
        OLD.file_url IS DISTINCT FROM NEW.file_url OR
        OLD.body     IS DISTINCT FROM NEW.body     OR
        OLD.metadata IS DISTINCT FROM NEW.metadata OR
        OLD.version  IS DISTINCT FROM NEW.version) THEN
      RAISE EXCEPTION
        'Artifact % is immutable (status=active). Use "Make changes" to create a new version.', OLD.id;
    END IF;
  END IF;

  IF OLD.status != 'active' AND NEW.status = 'active' THEN
    NEW.published_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER artifact_status_transition
  BEFORE UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION enforce_artifact_status_transition();

CREATE INDEX idx_artifacts_goal        ON artifacts(goal_id);
CREATE INDEX idx_artifacts_dept        ON artifacts(department_slug);
CREATE INDEX idx_artifacts_type        ON artifacts(artifact_type);
CREATE INDEX idx_artifacts_status      ON artifacts(status);
CREATE INDEX idx_artifacts_status_user ON artifacts(created_by, status);
CREATE INDEX idx_artifacts_published_at ON artifacts(published_at) WHERE status = 'active';
CREATE INDEX idx_artifacts_task_id     ON artifacts(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX idx_artifacts_file_size   ON artifacts(file_size) WHERE file_size IS NOT NULL;
CREATE INDEX idx_artifacts_skills_used ON artifacts USING GIN(skills_used);
CREATE INDEX idx_artifacts_sources_memo_ids   ON artifacts USING GIN((sources -> 'memo_ids'));
CREATE INDEX idx_artifacts_sources_kb_file_ids ON artifacts USING GIN((sources -> 'kb_file_ids'));

-- ---------------------------------------------------------------------------
-- TABLE: artifact_tool_dependencies
-- ---------------------------------------------------------------------------
CREATE TABLE artifact_tool_dependencies (
  artifact_id     UUID  NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  tool_slug       TEXT  NOT NULL,
  dependency_type TEXT  NOT NULL
    CHECK (dependency_type IN ('requires', 'optional', 'fallback')),
  PRIMARY KEY (artifact_id, tool_slug, dependency_type)
);

CREATE INDEX idx_artifact_tool_dep_slug ON artifact_tool_dependencies(tool_slug);
CREATE INDEX idx_artifact_tool_dep_type ON artifact_tool_dependencies(tool_slug, dependency_type);

-- ---------------------------------------------------------------------------
-- TABLE: knowledge_base_files
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge_base_files (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- File Metadata
  title               TEXT        NOT NULL,
  description         TEXT,
  file_name           TEXT        NOT NULL,
  file_type           TEXT,
  mime_type           TEXT,
  file_size           INTEGER,
  storage_path        TEXT        NOT NULL,
  file_url            TEXT        NOT NULL,

  -- Classification
  source_type         TEXT        DEFAULT 'upload'
    CHECK (source_type IN ('upload', 'generated', 'imported')),
  category            TEXT        DEFAULT 'custom'
    CHECK (category IN (
      'company_profile', 'pitch_deck', 'financial_report', 'handbook',
      'meeting_notes', 'research', 'legal', 'marketing', 'sales',
      'product', 'operations', 'custom'
    )),
  tags                TEXT[]      DEFAULT '{}',

  -- Processing pipeline state
  upload_status       TEXT        DEFAULT 'uploaded'
    CHECK (upload_status IN ('uploading', 'uploaded', 'failed')),
  processing_status   TEXT        DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),

  -- Extracted intelligence
  extracted_text      TEXT,
  extracted_summary   TEXT,
  extracted_metadata  JSONB       DEFAULT '{}',

  -- Embedding state
  embedding_status    TEXT        DEFAULT 'pending'
    CHECK (embedding_status IN ('pending', 'completed', 'failed')),

  -- Usage tracking
  reference_count     INTEGER     DEFAULT 0,
  last_referenced_at  TIMESTAMPTZ,

  -- Ownership (TEXT = Firebase UID)
  created_by          TEXT,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER knowledge_base_files_updated_at
  BEFORE UPDATE ON knowledge_base_files
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: knowledge_base_chunks (kb_chunks)
-- ---------------------------------------------------------------------------
CREATE TABLE knowledge_base_chunks (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_file_id UUID        REFERENCES knowledge_base_files(id) ON DELETE CASCADE,
  chunk_index       INTEGER     NOT NULL,
  content           TEXT        NOT NULL,
  token_count       INTEGER,
  -- pgvector embedding (1536-dim for OpenAI/Gemini text-embedding-3-small compat)
  embedding         vector(1536),
  metadata          JSONB       DEFAULT '{}',

  -- Ownership (TEXT = Firebase UID)
  created_by        TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kb_chunks_file_id   ON knowledge_base_chunks(knowledge_file_id);
-- HNSW index for fast ANN vector search
CREATE INDEX idx_kb_chunks_embedding ON knowledge_base_chunks
  USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- TABLE: connections (Composio / managed auth)
-- ---------------------------------------------------------------------------
CREATE TABLE connections (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name    TEXT        NOT NULL,
  connection_id   TEXT        NOT NULL,
  metadata        JSONB       DEFAULT '{}',

  -- Ownership (TEXT = Firebase UID)
  created_by      TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (created_by, service_name)
);

CREATE TRIGGER connections_updated_at
  BEFORE UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: user_consents
-- ---------------------------------------------------------------------------
CREATE TABLE user_consents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  terms_version    TEXT        NOT NULL,
  privacy_version  TEXT        NOT NULL,
  accepted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address       TEXT,

  -- Ownership (TEXT = Firebase UID)
  created_by       TEXT        NOT NULL
);

CREATE INDEX idx_user_consents_created_by ON user_consents(created_by);

-- ---------------------------------------------------------------------------
-- TABLE: suggested_actions
-- ---------------------------------------------------------------------------
CREATE TYPE suggested_action_status AS ENUM (
  'suggested', 'tapped', 'approved', 'executing',
  'completed', 'failed', 'dismissed'
);

CREATE TABLE suggested_actions (
  id                  UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type  TEXT                      NOT NULL
    CHECK (source_entity_type IN ('artifact', 'mission_report', 'memo')),
  source_entity_id    UUID                      NOT NULL,
  action_slug         TEXT                      NOT NULL,
  label               TEXT                      NOT NULL,
  reasoning           TEXT                      NOT NULL,
  payload             JSONB                     NOT NULL DEFAULT '{}',
  required_tool       TEXT,
  required_inputs     TEXT[]                    NOT NULL DEFAULT '{}',
  risk_level          TEXT                      NOT NULL
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status              suggested_action_status   NOT NULL DEFAULT 'suggested',
  approval_id         UUID                      REFERENCES approval_queue(id) ON DELETE SET NULL,
  result_artifact_id  UUID                      REFERENCES artifacts(id) ON DELETE SET NULL,

  -- Routing (from suggested_actions_routing migration)
  execution_path      TEXT                      NOT NULL DEFAULT 'external'
    CHECK (execution_path IN ('internal', 'external', 'approval_gate')),
  target_department   TEXT,

  -- Ownership (TEXT = Firebase UID)
  created_by          TEXT                      NOT NULL,

  created_at          TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_suggested_actions_source     ON suggested_actions(source_entity_type, source_entity_id);
CREATE INDEX idx_suggested_actions_status     ON suggested_actions(status) WHERE status = 'suggested';
CREATE INDEX idx_suggested_actions_created_by ON suggested_actions(created_by);
CREATE INDEX idx_suggested_actions_routing    ON suggested_actions(execution_path);

-- ---------------------------------------------------------------------------
-- TABLE: api_usage_logs
-- ---------------------------------------------------------------------------
CREATE TABLE api_usage_logs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id is TEXT = Firebase UID
  user_id           TEXT          NOT NULL,
  model             TEXT          NOT NULL,
  provider          TEXT          NOT NULL
    CHECK (provider IN ('openai', 'anthropic', 'gemini', 'groq')),
  key_type          TEXT          NOT NULL
    CHECK (key_type IN ('user', 'system')),
  prompt_tokens     INTEGER       NOT NULL DEFAULT 0,
  completion_tokens INTEGER       NOT NULL DEFAULT 0,
  total_tokens      INTEGER       NOT NULL DEFAULT 0,
  cost_estimate     NUMERIC(10,8) NOT NULL DEFAULT 0,
  goal_id           UUID          REFERENCES goals(id) ON DELETE SET NULL,
  task_id           TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_logs_user_day
  ON api_usage_logs (user_id, created_at DESC);
CREATE INDEX idx_api_usage_logs_key_type
  ON api_usage_logs (user_id, key_type, created_at DESC);

-- ---------------------------------------------------------------------------
-- TABLE: user_api_keys
-- ---------------------------------------------------------------------------
CREATE TABLE user_api_keys (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- created_by = Firebase UID
  created_by        TEXT        NOT NULL,
  provider          TEXT        NOT NULL,
  encrypted_key     TEXT        NOT NULL,
  is_valid          BOOLEAN     DEFAULT true,
  last_validated_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (created_by, provider)
);

CREATE INDEX idx_user_api_keys_provider ON user_api_keys(created_by, provider);

-- ---------------------------------------------------------------------------
-- TABLE: user_model_assignments (model_assignments)
-- ---------------------------------------------------------------------------
CREATE TABLE user_model_assignments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- created_by = Firebase UID
  created_by    TEXT        NOT NULL,
  role          TEXT        NOT NULL,
  model_name    TEXT        NOT NULL,
  provider      TEXT        NOT NULL,
  preset_config TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (created_by, role)
);

CREATE INDEX idx_user_model_assignments_role ON user_model_assignments(created_by, role);

CREATE TRIGGER user_model_assignments_updated_at
  BEFORE UPDATE ON user_model_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: orc_context
-- ---------------------------------------------------------------------------
CREATE TABLE orc_context (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id = Firebase UID
  user_id       TEXT,
  context_type  TEXT        NOT NULL
    CHECK (context_type IN ('profile', 'strategy', 'preference', 'constraint', 'outcome')),
  content       JSONB       NOT NULL DEFAULT '{}',
  summary       TEXT,
  recency_score INT         DEFAULT 50
    CHECK (recency_score >= 0 AND recency_score <= 100),
  source        TEXT        NOT NULL DEFAULT 'founder_input'
    CHECK (source IN ('founder_input', 'inferred_from_missions', 'extracted_from_memos')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orc_context_user_recency
  ON orc_context (user_id, recency_score DESC, updated_at DESC);
CREATE INDEX idx_orc_context_user_type
  ON orc_context (user_id, context_type);

CREATE TRIGGER orc_context_updated_at
  BEFORE UPDATE ON orc_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: idempotency_log
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  TEXT        NOT NULL,
  endpoint         TEXT        NOT NULL,
  method           TEXT        NOT NULL DEFAULT 'POST',
  -- user_id = Firebase UID (TEXT, nullable for anonymous calls)
  user_id          TEXT,
  request_hash     TEXT        NOT NULL,
  response         JSONB,
  status_code      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idempotency_log_unique_request
  ON idempotency_log (
    idempotency_key,
    endpoint,
    method,
    COALESCE(user_id, '__anon__')
  );

CREATE INDEX idempotency_log_user_created_at_idx
  ON idempotency_log (user_id, created_at DESC);
CREATE INDEX idempotency_log_created_at_idx
  ON idempotency_log (created_at);

COMMENT ON TABLE idempotency_log IS
  'Stores short-lived POST responses keyed by Idempotency-Key to prevent duplicate user-triggered operations.';

-- ---------------------------------------------------------------------------
-- TABLE: internal_instructions
-- ---------------------------------------------------------------------------
CREATE TABLE internal_instructions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL UNIQUE,
  category    TEXT        NOT NULL
    CHECK (category IN ('skill', 'prompt', 'directive')),
  content     TEXT        NOT NULL,
  version     TEXT        NOT NULL DEFAULT '1.0',
  -- created_by = Firebase UID
  created_by  TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE INDEX idx_internal_instructions_slug     ON internal_instructions(slug);
CREATE INDEX idx_internal_instructions_category ON internal_instructions(category);

-- ---------------------------------------------------------------------------
-- TABLE: capability_inventory
-- ---------------------------------------------------------------------------
CREATE TABLE capability_inventory (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_type      TEXT        NOT NULL
    CHECK (capability_type IN ('department_skill', 'tool', 'external_service', 'skill_layer')),
  capability_slug      TEXT        NOT NULL UNIQUE,
  display_name         TEXT        NOT NULL,
  description          TEXT,
  cost_per_use         JSONB       DEFAULT '{}',
  rate_limits          JSONB       DEFAULT '{}',
  success_rate         FLOAT       DEFAULT 1.0
    CHECK (success_rate >= 0.0 AND success_rate <= 1.0),
  last_successful_use  TIMESTAMPTZ,
  last_failure         TIMESTAMPTZ,
  failure_reason       TEXT,
  status               TEXT        DEFAULT 'available'
    CHECK (status IN ('available', 'degraded', 'unavailable', 'experimental')),
  requires_connection  BOOLEAN     DEFAULT false,
  requires_approval    BOOLEAN     DEFAULT false,
  alternatives         TEXT[]      DEFAULT '{}',
  metadata             JSONB       DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cap_inv_type_status ON capability_inventory (capability_type, status);
CREATE INDEX idx_cap_inv_slug        ON capability_inventory (capability_slug);

INSERT INTO capability_inventory
  (capability_type, capability_slug, display_name, description, status, requires_approval)
VALUES
  ('department_skill', 'marketing.content_creation',   'Content Creation',        'Blog posts, social content, newsletters, marketing copy',     'available', false),
  ('department_skill', 'marketing.brand_guidelines',   'Brand Guidelines',        'Brand voice, visual identity, messaging frameworks',          'available', false),
  ('department_skill', 'marketing.social_strategy',    'Social Media Strategy',   'Platform strategy, content calendars, audience targeting',    'available', false),
  ('department_skill', 'marketing.image_generation',   'Image Generation',        'AI-generated images for marketing materials',                 'available', false),
  ('department_skill', 'engineering.code_review',      'Code Review',             'Pull request reviews, architecture feedback, best practices', 'available', false),
  ('department_skill', 'engineering.api_design',       'API Design',              'REST/GraphQL API specification, schema design',               'available', false),
  ('department_skill', 'engineering.script_automation','Script Automation',       'Python/JS scripts for data processing and automation',        'available', false),
  ('department_skill', 'engineering.data_analysis',    'Data Analysis',           'SQL queries, data interpretation, reporting',                 'available', false),
  ('department_skill', 'sales.pitch_crafting',         'Pitch Crafting',          'Sales decks, investor pitches, customer presentations',       'available', false),
  ('department_skill', 'sales.outreach_sequencing',    'Outreach Sequencing',     'Email sequences, follow-up cadences, cold outreach',          'available', false),
  ('department_skill', 'sales.crm_management',         'CRM Management',          'Pipeline tracking, deal stages, contact management',          'available', false),
  ('department_skill', 'finance.financial_modeling',   'Financial Modeling',      'Revenue projections, unit economics, burn rate analysis',     'available', false),
  ('department_skill', 'finance.pricing_analysis',     'Pricing Analysis',        'Pricing strategy, competitive benchmarking, packaging',       'available', false),
  ('department_skill', 'finance.metrics_dashboard',    'Metrics Dashboard',       'KPI tracking, growth metrics, investor-ready summaries',      'available', false),
  ('department_skill', 'legal.contract_templates',     'Contract Templates',      'NDAs, MSAs, employment agreements, SaaS contracts',           'available', false),
  ('department_skill', 'legal.privacy_policies',       'Privacy Policies',        'GDPR-compliant privacy policies, terms of service',           'available', false),
  ('skill_layer',      'skill.docx_generation',        'Word Document Generation','Structured document output as .docx files',                   'available', false),
  ('skill_layer',      'skill.xlsx_generation',        'Excel Spreadsheet Generation','Tabular data output as .xlsx files',                      'available', false),
  ('skill_layer',      'skill.pptx_generation',        'PowerPoint Generation',   'Presentation slides as .pptx files',                         'available', false),
  ('external_service', 'ext.video_editing',            'Video Editing',           'Professional video production and editing',                   'unavailable', true),
  ('external_service', 'ext.legal_review',             'Legal Review',            'Attorney review and legal advice',                           'unavailable', true),
  ('external_service', 'ext.financial_audit',          'Financial Audit',         'CPA-level financial auditing',                               'unavailable', true)
ON CONFLICT (capability_slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE: external_services
-- ---------------------------------------------------------------------------
CREATE TABLE external_services (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name              TEXT        NOT NULL,
  category                  TEXT        NOT NULL,
  when_to_use               TEXT,
  recommended_vendors       TEXT[]      DEFAULT '{}',
  estimated_cost_range      TEXT,
  turnaround_time           TEXT,
  founder_decision_required BOOLEAN     DEFAULT true,
  orc_can_brief             BOOLEAN     DEFAULT true,
  status                    TEXT        DEFAULT 'available'
    CHECK (status IN ('available', 'blocked_by_budget', 'blocked_by_founder_preference')),
  related_capability_slug   TEXT        REFERENCES capability_inventory(capability_slug) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ext_svc_status   ON external_services (status);
CREATE INDEX idx_ext_svc_category ON external_services (category);
CREATE INDEX idx_ext_svc_cap_slug ON external_services (related_capability_slug);

INSERT INTO external_services
  (service_name, category, when_to_use, recommended_vendors, estimated_cost_range,
   turnaround_time, founder_decision_required, orc_can_brief, related_capability_slug)
VALUES
  ('Video Editing',       'external_service',
   'When founder requests a video, animation, or screen recording that requires post-production',
   ARRAY['Fiverr', 'Upwork', 'Motion Array'], '$200-500', '24-48 hours', true, true, 'ext.video_editing'),
  ('Legal Review',        'external_service',
   'When a contract, policy, or legal document needs attorney sign-off beyond template use',
   ARRAY['Clerky', 'Stripe Atlas Legal', 'UpCounsel'], '$500-2000', '3-5 business days', true, true, 'ext.legal_review'),
  ('Financial Audit',     'external_service',
   'When investor due diligence or regulatory compliance requires CPA-level financial review',
   ARRAY['Pilot.com', 'Kruze Consulting', 'local CPA'], '$2000-10000', '2-4 weeks', true, true, 'ext.financial_audit'),
  ('Brand Identity Design','external_service',
   'When founder needs a full visual identity system beyond content generation',
   ARRAY['99designs', 'Dribbble freelancers', 'Looka'], '$500-3000', '1-2 weeks', true, true, NULL),
  ('Data Engineering',    'external_service',
   'When the goal requires production-grade data pipelines beyond analytics scripts',
   ARRAY['Toptal', 'Upwork senior engineers', 'Fiverr Pro'], '$1500-5000', '1-3 weeks', true, true, NULL)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- TABLE: orc_decision_log
-- ---------------------------------------------------------------------------
CREATE TABLE orc_decision_log (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id = Firebase UID
  user_id              TEXT,
  goal_id              UUID        REFERENCES goals(id) ON DELETE SET NULL,
  decision_type        TEXT        NOT NULL,
  founder_intent       TEXT,
  orc_choice           TEXT        NOT NULL,
  confidence           FLOAT       CHECK (confidence >= 0.0 AND confidence <= 1.0),
  assumptions          JSONB       DEFAULT '{}',
  risk_tier            INT         CHECK (risk_tier IN (1, 2, 3)),
  risk_notes           TEXT[]      DEFAULT '{}',
  capability_gaps      JSONB       DEFAULT '[]',
  founder_override     BOOLEAN     DEFAULT false,
  override_reason      TEXT,
  outcome              TEXT        CHECK (outcome IN ('successful', 'partial', 'failed', 'unknown')),
  outcome_description  TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  outcome_at           TIMESTAMPTZ
);

CREATE INDEX idx_orc_decision_log_user_goal
  ON orc_decision_log (user_id, goal_id);
CREATE INDEX idx_orc_decision_log_outcome
  ON orc_decision_log (user_id, outcome, created_at DESC)
  WHERE outcome IS NOT NULL;

-- ---------------------------------------------------------------------------
-- TABLE: company_profile
-- ---------------------------------------------------------------------------
CREATE TABLE company_profile (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- created_by = Firebase UID; UNIQUE so one profile per user
  created_by           TEXT        NOT NULL UNIQUE,
  company_name         TEXT        NOT NULL,
  founder_name         TEXT        NOT NULL,
  industry             TEXT,
  location             TEXT,
  city                 TEXT,
  country              TEXT,
  business_description TEXT,
  business_category    TEXT,
  stage                TEXT
    CHECK (stage IN ('starting', 'mvp', 'traction', 'scaling')),
  local_identity       JSONB,
  business_model       TEXT,
  target_customer      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_profile_created_by ON company_profile(created_by);

CREATE TRIGGER company_profile_updated_at
  BEFORE UPDATE ON company_profile
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: recurring_missions
-- ---------------------------------------------------------------------------
CREATE TABLE recurring_missions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id = Firebase UID
  user_id          TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  founder_input    TEXT        NOT NULL,
  cadence          TEXT        NOT NULL
    CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  cadence_day      INTEGER,
  next_run_at      TIMESTAMPTZ NOT NULL,
  last_run_at      TIMESTAMPTZ,
  last_goal_id     UUID        REFERENCES goals(id) ON DELETE SET NULL,
  source_goal_id   UUID        REFERENCES goals(id) ON DELETE SET NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  auto_dispatch    BOOLEAN     NOT NULL DEFAULT false,
  risk_tier_limit  INTEGER     NOT NULL DEFAULT 1 CHECK (risk_tier_limit BETWEEN 1 AND 3),
  run_count        INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_missions_due  ON recurring_missions (next_run_at, is_active) WHERE is_active = true;
CREATE INDEX idx_recurring_missions_user ON recurring_missions (user_id, created_at DESC);

CREATE TRIGGER trg_recurring_missions_updated_at
  BEFORE UPDATE ON recurring_missions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- TABLE: company_calendar_events
-- ---------------------------------------------------------------------------
CREATE TABLE company_calendar_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- user_id = Firebase UID
  user_id          TEXT        NOT NULL,
  type             TEXT        NOT NULL DEFAULT 'other'
    CHECK (type IN ('investor_meeting','customer_call','board_meeting','conference','deadline','other')),
  title            TEXT        NOT NULL,
  date             TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  attendees        TEXT[]      NOT NULL DEFAULT '{}',
  prep_required    TEXT[]      NOT NULL DEFAULT '{}',
  related_goals    UUID[]      NOT NULL DEFAULT '{}',
  meeting_notes    TEXT,
  outcomes         TEXT,
  next_actions     TEXT[]      NOT NULL DEFAULT '{}',
  source           TEXT        NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','google_calendar')),
  external_id      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX company_calendar_events_external_id_user_idx
  ON company_calendar_events (user_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX company_calendar_events_date_user_idx
  ON company_calendar_events (user_id, date);

CREATE TRIGGER trg_company_calendar_events_updated_at
  BEFORE UPDATE ON company_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- END OF MIGRATION
-- All tables created. Extensions: uuid-ossp, vector.
-- No auth.users references. All user IDs stored as TEXT (Firebase UID format).
-- No RLS policies — enforce access at the application layer.
-- ---------------------------------------------------------------------------
