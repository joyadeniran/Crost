-- Migration: Artifact tool dependencies
-- Tracks which skills/tools each artifact requires, optionally uses, or can fall back to.
-- Enables: regress detection when tools change, A/B comparison across skill versions.

CREATE TABLE IF NOT EXISTS artifact_tool_dependencies (
  artifact_id     UUID  NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  tool_slug       TEXT  NOT NULL,
  dependency_type TEXT  NOT NULL
    CHECK (dependency_type IN ('requires', 'optional', 'fallback')),
  PRIMARY KEY (artifact_id, tool_slug, dependency_type)
);

-- RLS via artifact ownership — if you own the artifact, you own its dependency rows
ALTER TABLE artifact_tool_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dependency access follows artifact ownership"
  ON artifact_tool_dependencies FOR ALL
  USING (
    artifact_id IN (
      SELECT id FROM artifacts WHERE created_by = auth.uid()
    )
  );

-- Lookup: "which artifacts depend on tool X?" (for regress checks)
CREATE INDEX IF NOT EXISTS idx_artifact_tool_dep_slug ON artifact_tool_dependencies(tool_slug);
CREATE INDEX IF NOT EXISTS idx_artifact_tool_dep_type ON artifact_tool_dependencies(tool_slug, dependency_type);
