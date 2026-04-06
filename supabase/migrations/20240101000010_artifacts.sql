-- Migration 010: Artifacts
-- Stores permanent work products from departments (designs, reports, files)

CREATE TABLE artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  department_slug TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('image', 'document', 'code', 'data', 'spreadsheet')),
  title TEXT NOT NULL,
  body TEXT,                                 -- Main text/content
  metadata JSONB DEFAULT '{}',               -- Raw results, URLs, params
  preview_url TEXT,                          -- For images/external files
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_goal_id ON artifacts(goal_id);
CREATE INDEX idx_artifacts_dept ON artifacts(department_slug);
CREATE INDEX idx_artifacts_type ON artifacts(artifact_type);

-- Enable realtime for artifacts
ALTER PUBLICATION supabase_realtime ADD TABLE artifacts;
