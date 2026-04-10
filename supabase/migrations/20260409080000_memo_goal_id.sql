-- Migration: 20260409080000_memo_goal_id.sql
-- Adds goal_id to company_memos to enable goal-specific tool output tracking and synthesis.

ALTER TABLE company_memos ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES goals(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_memos_goal_id ON company_memos(goal_id);

COMMENT ON COLUMN company_memos.goal_id IS 'The specific goal this memo is associated with. Allows Orc to filter for relevant tool outputs during synthesis.';
