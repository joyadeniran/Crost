-- Migration: Add error_code to event_log
-- Purpose: Support premium error strategy with actionable codes.

ALTER TABLE event_log ADD COLUMN IF NOT EXISTS error_code TEXT;

-- Index for surgical error searching
CREATE INDEX IF NOT EXISTS idx_event_log_error_code ON event_log(error_code) WHERE error_code IS NOT NULL;

-- Update the final stabilization script as well for new environments
-- (Appending to the existing stabilization migration is fine for a single consolidated run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'event_log' AND column_name = 'error_code') THEN
    ALTER TABLE event_log ADD COLUMN error_code TEXT;
    CREATE INDEX idx_event_log_error_code ON event_log(error_code) WHERE error_code IS NOT NULL;
  END IF;
END
$$;
