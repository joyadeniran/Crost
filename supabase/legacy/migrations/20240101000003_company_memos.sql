-- Migration 003: Company Memos
-- Cross-department knowledge sharing system

CREATE TABLE company_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_department TEXT NOT NULL,             -- Slug (denormalized; survives dept rename via trigger)
  from_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',                  -- Routing mechanism: ['all'], ['engineering'], etc.
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  onyx_index_id TEXT,                        -- NULL = not yet indexed in Vespa
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_by TEXT[] DEFAULT '{}'               -- Array of department slugs that have read this memo
);

-- Keep from_department slug in sync on rename
CREATE OR REPLACE FUNCTION sync_memo_department_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.slug != NEW.slug THEN
    UPDATE company_memos
    SET from_department = NEW.slug
    WHERE from_department = OLD.slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_memos_on_dept_rename
  AFTER UPDATE OF slug ON departments
  FOR EACH ROW EXECUTE FUNCTION sync_memo_department_slug();

CREATE INDEX idx_memos_tags ON company_memos USING GIN(tags);
CREATE INDEX idx_memos_from_department ON company_memos(from_department);
CREATE INDEX idx_memos_priority ON company_memos(priority) WHERE priority IN ('high', 'urgent');
