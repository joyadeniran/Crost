-- Migration: Fix department cloning unique constraint and improve approval_queue performance
-- 
-- 1. Drop the legacy unique constraint on onyx_persona_id/orc_persona_id
--    This allows multiple users to have departments referencing the same template ID (e.g. direct_llm:sales).
--    The original constraint was created as 'departments_onyx_persona_id_key' or an implicit one.

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_onyx_persona_id_key;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_orc_persona_id_key;

-- Also drop any indexes that might be enforcing uniqueness
DROP INDEX IF EXISTS idx_departments_onyx_persona_id;
DROP INDEX IF EXISTS idx_departments_orc_persona_id;

-- 2. Add indexes to approval_queue for better query performance and to prevent timeouts
--    These support the RLS policy and the frequently polled pending count query.
CREATE INDEX IF NOT EXISTS idx_approval_queue_created_by ON approval_queue(created_by);
CREATE INDEX IF NOT EXISTS idx_approval_queue_user_id ON approval_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_queue_status ON approval_queue(status);

-- 3. Add index to departments for faster lookups per user
CREATE INDEX IF NOT EXISTS idx_departments_created_by ON departments(created_by);

-- 4. Ensure orc_persona_id can be shared across users but is unique per user if needed
--    Actually, we just want to remove the global uniqueness.
--    The (created_by, slug) index already handles per-user uniqueness.
