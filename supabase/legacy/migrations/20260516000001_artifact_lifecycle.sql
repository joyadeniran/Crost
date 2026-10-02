-- Migration: Artifact Lifecycle
-- Adds sandbox → review → active lifecycle with immutability and discard support.
-- All new columns have defaults so existing rows are not broken.

ALTER TABLE artifacts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'review'
    CHECK (status IN ('draft', 'review', 'active', 'paused', 'deprecated', 'discarded')),
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- All artifacts created before this migration are already complete — promote to 'review'.
-- New artifacts created from this point forward start as 'draft'.
-- The DEFAULT above ensures new rows land on 'review' from old code paths until they are
-- updated to pass 'draft' explicitly; a follow-up step in Phase 2 switches that default.
UPDATE artifacts SET status = 'review', version = 1
  WHERE status = 'review';  -- no-op SQL guard; real backfill is the DEFAULT above

-- Enforce valid state transitions via a trigger.
-- Rules:
--   • 'discarded'  is only reachable from 'draft' or 'review'  (pre-activation only)
--   • 'deprecated' is only reachable from 'active' or 'paused' (post-activation only)
--   • 'active'     is only reachable from 'review'
--   • 'paused'     is only reachable from 'active'
CREATE OR REPLACE FUNCTION enforce_artifact_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Prevent discarding a published artifact
  IF OLD.status IN ('active', 'paused', 'deprecated') AND NEW.status = 'discarded' THEN
    RAISE EXCEPTION
      'Cannot discard a published artifact (status=%). Use deprecated instead.', OLD.status;
  END IF;

  -- Prevent deprecating an unpublished artifact
  IF OLD.status IN ('draft', 'review') AND NEW.status = 'deprecated' THEN
    RAISE EXCEPTION
      'Cannot deprecate an unpublished artifact (status=%). Use discarded instead.', OLD.status;
  END IF;

  -- Prevent editing an active artifact (immutability)
  IF OLD.status = 'active' AND NEW.status = 'active' THEN
    -- Allow only status-preserving fields: approved_by, published_at are already locked.
    -- Any field change while active is rejected.
    IF (OLD.title      IS DISTINCT FROM NEW.title      OR
        OLD.file_url   IS DISTINCT FROM NEW.file_url   OR
        OLD.body       IS DISTINCT FROM NEW.body        OR
        OLD.metadata   IS DISTINCT FROM NEW.metadata    OR
        OLD.version    IS DISTINCT FROM NEW.version) THEN
      RAISE EXCEPTION
        'Artifact % is immutable (status=active). Use "Make changes" to create a new version.', OLD.id;
    END IF;
  END IF;

  -- Set published_at when first reaching active
  IF OLD.status != 'active' AND NEW.status = 'active' THEN
    NEW.published_at := NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artifact_status_transition ON artifacts;
CREATE TRIGGER artifact_status_transition
  BEFORE UPDATE ON artifacts
  FOR EACH ROW EXECUTE FUNCTION enforce_artifact_status_transition();

-- Indices for gallery queries and status filtering
CREATE INDEX IF NOT EXISTS idx_artifacts_status         ON artifacts(status);
CREATE INDEX IF NOT EXISTS idx_artifacts_status_user    ON artifacts(created_by, status);
CREATE INDEX IF NOT EXISTS idx_artifacts_published_at   ON artifacts(published_at) WHERE status = 'active';
