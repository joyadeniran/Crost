-- Migration 9: Enable Realtime for key tables
-- Required to push UI updates to LiveEventsPanel and other live components.

-- Create the supabase_realtime publication if it doesn't exist (it usually does by default on Supabase, but we must be safe)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Add all tables that need client-side subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE event_log;
ALTER PUBLICATION supabase_realtime ADD TABLE departments;
ALTER PUBLICATION supabase_realtime ADD TABLE approval_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE goals;
