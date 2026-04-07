-- Migration 013: Fix Realtime issues on event_log
-- 1. Ensure any user (anon or authenticated) can READ the live event feed.
-- 2. Set replica identity to FULL to ensure all metadata is broadcasted.

-- Set replica identity for robust Realtime broadcasts
ALTER TABLE event_log REPLICA IDENTITY FULL;

-- Ensure permissive read access for all
DROP POLICY IF EXISTS "permissive_authed" ON event_log;
CREATE POLICY "permissive_read_all" ON event_log FOR SELECT TO public USING (true);
CREATE POLICY "permissive_write_authed" ON event_log FOR INSERT TO authenticated WITH CHECK (true);

-- Ensure Realtime is enabled for event_log explicitly (refresh)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'event_log') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE event_log;
  END IF;
END
$$;
