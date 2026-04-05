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
-- event_log        — for live activity sidebar feed
