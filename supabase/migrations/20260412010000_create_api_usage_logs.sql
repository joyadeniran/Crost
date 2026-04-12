-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260412010000_create_api_usage_logs.sql
-- Purpose:   Create billing/quota table and normalise provider names
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Part 1: api_usage_logs table ────────────────────────────────────────────
-- Separate from event_log (system events) — this is billing + per-user quota.
-- user_id convention (not created_by) matches the new standard.

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model             TEXT          NOT NULL,
  provider          TEXT          NOT NULL CHECK (provider IN ('openai','anthropic','gemini','groq')),
  key_type          TEXT          NOT NULL CHECK (key_type IN ('user','system')),
  prompt_tokens     INTEGER       NOT NULL DEFAULT 0,
  completion_tokens INTEGER       NOT NULL DEFAULT 0,
  total_tokens      INTEGER       NOT NULL DEFAULT 0,
  cost_estimate     NUMERIC(10,8) NOT NULL DEFAULT 0,
  goal_id           UUID          REFERENCES goals(id) ON DELETE SET NULL,
  task_id           TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- RLS: users may read only their own rows.
-- Server-side routes use the service role key and bypass RLS for writes.
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY api_usage_logs_read_own
  ON api_usage_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Index for per-user per-day quota queries (checkTokenBudget)
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_day
  ON api_usage_logs (user_id, created_at DESC);

-- Index for key_type breakdown queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_key_type
  ON api_usage_logs (user_id, key_type, created_at DESC);


-- ─── Part 2: Provider name normalisation ─────────────────────────────────────
-- Canonical set: openai | anthropic | gemini | groq  (LiteLLM prefix convention)
-- Fixes legacy values stored by old UI components ('claude', 'google').

UPDATE user_api_keys
  SET provider = 'anthropic'
  WHERE provider = 'claude';

UPDATE user_api_keys
  SET provider = 'gemini'
  WHERE provider = 'google';

UPDATE user_model_assignments
  SET provider = 'anthropic'
  WHERE provider = 'claude';

UPDATE user_model_assignments
  SET provider = 'gemini'
  WHERE provider = 'google';


-- ─── Part 3: Invalidate orphaned API keys in system_config ──────────────────
-- ApiKeysSettings.tsx previously saved raw keys into system_config.
-- These are now stored encrypted in user_api_keys.
-- Cannot DELETE (trigger blocks it). Cannot NULL (NOT NULL constraint).
-- Overwrite with empty sentinel so the values are harmless.

UPDATE system_config
  SET value = '""'
  WHERE key IN (
    'gemini_api_key',
    'google_api_key',
    'claude_api_key',
    'groq_api_key'
  );
