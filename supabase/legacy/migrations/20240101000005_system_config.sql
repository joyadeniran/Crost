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
