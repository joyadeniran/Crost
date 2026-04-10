-- Migration: 20260409040000_multitenant_tools.sql
-- Implements the multi-tenant "Lean" tool policy with UI vs Agent separation.

-- 1. Preparation: Add user_id column
ALTER TABLE available_tools ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Structure: Add is_action to separate Toolkits (UI) from specific Tools (Agent)
ALTER TABLE available_tools ADD COLUMN IF NOT EXISTS is_action BOOLEAN DEFAULT false;

-- 3. Cleanup: Remove existing global rows (they will be re-seeded per-user)
DELETE FROM available_tools;

-- 4. Structure: Update PK to (id, user_id)
ALTER TABLE available_tools DROP CONSTRAINT IF EXISTS available_tools_pkey CASCADE;
ALTER TABLE available_tools ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE available_tools ADD PRIMARY KEY (id, user_id);

-- 5. Enable RLS
ALTER TABLE available_tools ENABLE ROW LEVEL SECURITY;

-- 6. Policies: Water-tight multi-tenant scoping
CREATE POLICY "Users can only see and manage their own tools" 
ON available_tools FOR ALL 
USING (user_id = auth.uid());
