-- Migration: Company Calendar Events
-- Stores upcoming founder events (investor meetings, customer calls, board meetings, etc.)
-- synced from Google Calendar or entered manually. Powers proactive prep suggestions.

CREATE TABLE IF NOT EXISTS company_calendar_events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type              TEXT        NOT NULL DEFAULT 'other'
                                CHECK (type IN ('investor_meeting','customer_call','board_meeting','conference','deadline','other')),
  title             TEXT        NOT NULL,
  date              TIMESTAMPTZ NOT NULL,
  duration_minutes  INTEGER,
  attendees         TEXT[]      NOT NULL DEFAULT '{}',
  prep_required     TEXT[]      NOT NULL DEFAULT '{}',
  related_goals     UUID[]      NOT NULL DEFAULT '{}',
  meeting_notes     TEXT,
  outcomes          TEXT,
  next_actions      TEXT[]      NOT NULL DEFAULT '{}',
  source            TEXT        NOT NULL DEFAULT 'manual'
                                CHECK (source IN ('manual','google_calendar')),
  external_id       TEXT,       -- Google Calendar event ID (for upsert dedup)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE company_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own calendar events"
  ON company_calendar_events
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role bypass on company_calendar_events"
  ON company_calendar_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Dedup index for Google Calendar sync (one external event per user)
CREATE UNIQUE INDEX IF NOT EXISTS company_calendar_events_external_id_user_idx
  ON company_calendar_events (user_id, external_id)
  WHERE external_id IS NOT NULL;

-- Fast upcoming-events query
CREATE INDEX IF NOT EXISTS company_calendar_events_date_user_idx
  ON company_calendar_events (user_id, date);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_company_calendar_events_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_calendar_events_updated_at
  BEFORE UPDATE ON company_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_company_calendar_events_updated_at();
