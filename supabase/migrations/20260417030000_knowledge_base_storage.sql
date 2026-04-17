-- Migration v9.1 hotfix: Create knowledge-base storage bucket
-- The knowledge_base tables were created in 20260417020000 but the
-- Supabase Storage bucket was never provisioned, causing all uploads to fail
-- with "bucket not found". This migration adds the bucket and object policies.

INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-base', 'knowledge-base', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated founders to read files from the knowledge-base bucket
CREATE POLICY "KB Public Read"
ON storage.objects FOR SELECT
USING ( bucket_id = 'knowledge-base' );

-- Allow authenticated users to upload their own files
CREATE POLICY "KB Founder Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL );

-- Allow founders to delete their own files
CREATE POLICY "KB Founder Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'knowledge-base' AND auth.uid() IS NOT NULL );
