-- Cloud SQL parity fix — Session v13.17 (2026-07-02)
-- Phase 3 (10x rebuild): state-machine characterization work surfaced a live
-- production bug. Confirmed against the live DB (crost-hq:us-central1:crost-db):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'goals_status_check';
--   -> CHECK ((status = ANY (ARRAY['pending','planning','awaiting_approval','executing','completed','failed'])))
--
-- lib/engine/orchestrator.ts writes two values NOT in that list, in normal
-- (non-error-handling) code paths:
--   - 'clarifying' (dialogue mode — goal needs more info from the founder)
--   - 'error'      (both primary and retry LLM attempts proposed hallucinated
--                    departments; HIGH-1 fix path, "mark goal as error rather
--                    than leaving it stuck in 'planning' forever")
-- Both currently throw a raw Postgres CHECK-constraint violation in prod
-- whenever those paths execute.
--
-- 'clarifying' was deliberately added once before, in the pre-Cloud-SQL era
-- (supabase/migrations/20240101000014_dialogue_mode.sql), but that widening
-- was never carried into cloudsql_migration.sql when the schema was ported.
-- 'error' has never been added anywhere — this is a net-new, always-broken path.
--
-- Idempotent.

ALTER TABLE goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE goals ADD CONSTRAINT goals_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'clarifying'::text, 'planning'::text, 'awaiting_approval'::text,
    'executing'::text, 'completed'::text, 'failed'::text, 'error'::text
  ]));
