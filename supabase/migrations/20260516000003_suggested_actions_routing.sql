-- Migration: Suggested Actions execution routing
-- Adds execution_path so the gateway knows whether to execute internally,
-- route through Composio, or hold behind an approval gate.

ALTER TABLE suggested_actions
  ADD COLUMN IF NOT EXISTS execution_path TEXT NOT NULL DEFAULT 'external'
    CHECK (execution_path IN ('internal', 'external', 'approval_gate')),
  ADD COLUMN IF NOT EXISTS target_department TEXT;

-- Backfill: classify known internal action slugs
UPDATE suggested_actions
  SET execution_path = 'internal'
  WHERE action_slug IN (
    'make_changes',
    'add_to_memo',
    'save_to_kb',
    'schedule_recurring',
    'share_with_teammate',
    'generate_companion',
    'draft_followup'
  );

-- External actions that need Composio
UPDATE suggested_actions
  SET execution_path = 'external'
  WHERE action_slug IN (
    'send_to_email',
    'send_to_contact',
    'post_social',
    'share_via_link'
  );

-- Everything else defaults to approval_gate (conservative)
UPDATE suggested_actions
  SET execution_path = 'approval_gate'
  WHERE execution_path = 'external'
    AND action_slug NOT IN (
      'send_to_email', 'send_to_contact', 'post_social', 'share_via_link'
    );

CREATE INDEX IF NOT EXISTS idx_suggested_actions_routing ON suggested_actions(execution_path);
