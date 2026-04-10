-- Migration: 20260410010000_storage_and_artifacts_fix.sql
-- 1. Add created_by to artifacts for multi-tenancy
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Enable RLS and add policy
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own artifacts" ON artifacts FOR ALL USING (created_by = auth.uid());

-- 3. Create the artifacts bucket in storage
INSERT INTO storage.buckets (id, name, public)
VALUES ('artifacts', 'artifacts', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Enable RLS on storage.objects for artifacts
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'artifacts' );

CREATE POLICY "Founder Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'artifacts' AND auth.uid() IS NOT NULL );
