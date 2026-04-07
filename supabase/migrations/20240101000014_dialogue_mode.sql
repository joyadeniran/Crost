-- Migration 14: dialogue_mode
-- Adds 'clarifying' status to goals and 'orc_conversation' for persistent chat history.
-- This enables the "Chief of Staff" dialogue mode before planning.

-- 1. Update goals status check constraint
-- We drop and recreate because Postgres CHECK constraints on enums/text are immutable-ish
ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE goals ADD CONSTRAINT goals_status_check 
  CHECK (status IN ('pending', 'clarifying', 'planning', 'awaiting_approval', 'executing', 'completed', 'failed'));

-- 2. Add orc_conversation column for persistent chat history
-- Stores array of { role: 'user' | 'assistant', content: string, ts: string }
ALTER TABLE goals 
  ADD COLUMN IF NOT EXISTS orc_conversation JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN goals.orc_conversation IS 'Array of messages between founder and Orc during the clarification phase.';
COMMENT ON COLUMN goals.status IS 'Current lifecycle state. "clarifying" indicates Orc is seeking more detail before drafting a plan.';
