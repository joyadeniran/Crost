-- Migration 012: Row Level Security
-- Enables RLS on all tables with permissive initial policies.
-- The service-role key (used in API routes) bypasses RLS — safe.
-- The anon key (used in browser) is restricted to authenticated users only.
-- Tighten to per-user policies when multi-tenancy is introduced.

-- Enable RLS on all tables
ALTER TABLE departments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_memos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE available_tools    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts          ENABLE ROW LEVEL SECURITY;

-- ─── Initial permissive policy: authenticated users can do anything ───────────
-- This is intentionally permissive for the single-founder MVP.
-- When multi-tenancy ships, replace with: USING (auth.uid() = created_by)

CREATE POLICY "authenticated_full_access" ON departments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON approval_queue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON company_memos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON event_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON system_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON available_tools
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON goals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON goal_tasks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON artifacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Service role bypasses RLS — no policy needed ─────────────────────────────
-- API routes using createServerSupabaseClient() (service role key) bypass RLS.
-- This is correct — server routes are the trusted layer.
-- Browser clients using supabaseClient (anon key) are now restricted to
-- authenticated sessions only.
