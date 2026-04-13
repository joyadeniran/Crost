-- Allow global department templates and per-user department copies to coexist.
-- This removes global uniqueness on name/slug and replaces it with per-user
-- uniqueness plus a separate uniqueness rule for global templates.

ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_name_key;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_slug_key;

DROP INDEX IF EXISTS idx_departments_one_orchestrator;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_user_slug
ON departments (created_by, slug)
WHERE created_by IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_global_slug
ON departments (slug)
WHERE created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_user_name
ON departments (created_by, name)
WHERE created_by IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_global_name
ON departments (name)
WHERE created_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_user_orchestrator
ON departments (created_by)
WHERE is_orchestrator = true AND created_by IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_global_orchestrator
ON departments ((1))
WHERE is_orchestrator = true AND created_by IS NULL;
