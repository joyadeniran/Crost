-- Migration: Add Suggested Actions table (Spec §6.1)

CREATE TYPE suggested_action_status AS ENUM (
  'suggested',
  'tapped',
  'approved',
  'executing',
  'completed',
  'failed',
  'dismissed'
);

CREATE TABLE suggested_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN ('artifact', 'mission_report', 'memo')),
  source_entity_id UUID NOT NULL,
  action_slug TEXT NOT NULL,
  label TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  required_tool TEXT,
  required_inputs TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status suggested_action_status DEFAULT 'suggested' NOT NULL,
  approval_id UUID REFERENCES approval_queue(id) ON DELETE SET NULL,
  result_artifact_id UUID REFERENCES artifacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) NOT NULL
);

-- Indices for quick lookup by source entity
CREATE INDEX idx_suggested_actions_source ON suggested_actions(source_entity_type, source_entity_id);
CREATE INDEX idx_suggested_actions_status ON suggested_actions(status) WHERE status = 'suggested';
CREATE INDEX idx_suggested_actions_created_by ON suggested_actions(created_by);

-- Add suggested_actions array to artifacts table
ALTER TABLE artifacts ADD COLUMN suggested_actions UUID[] DEFAULT '{}'::UUID[];

-- Security constraints
ALTER TABLE suggested_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own suggested actions"
ON suggested_actions
FOR ALL
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);
