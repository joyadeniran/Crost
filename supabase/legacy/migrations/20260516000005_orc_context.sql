-- Migration: orc_context table
-- Brain 1 (Memory) from ORC_ORCHESTRATION_UPGRADE_PLAN.md §B.1
-- Stores structured company state: profile, strategy, preferences, constraints, outcomes.
-- Orc fetches top-20 rows (ranked by recency_score) before every major decision.

CREATE TABLE IF NOT EXISTS orc_context (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type  TEXT        NOT NULL
    CHECK (context_type IN ('profile', 'strategy', 'preference', 'constraint', 'outcome')),
  content       JSONB       NOT NULL DEFAULT '{}',
  summary       TEXT,           -- natural language excerpt for LLM injection
  recency_score INT         DEFAULT 50
    CHECK (recency_score >= 0 AND recency_score <= 100),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  source        TEXT        NOT NULL DEFAULT 'founder_input'
    CHECK (source IN ('founder_input', 'inferred_from_missions', 'extracted_from_memos'))
);

ALTER TABLE orc_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own orc context"
  ON orc_context FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Primary lookup: top-N by recency for a given user
CREATE INDEX IF NOT EXISTS idx_orc_context_user_recency
  ON orc_context (user_id, recency_score DESC, updated_at DESC);

-- Secondary: filter by type within a user's context
CREATE INDEX IF NOT EXISTS idx_orc_context_user_type
  ON orc_context (user_id, context_type);
