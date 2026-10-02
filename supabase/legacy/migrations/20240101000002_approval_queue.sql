-- Migration 002: Approval Queue
-- Human-in-the-loop gate for all irreversible department actions

CREATE TABLE approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  department_name TEXT NOT NULL,             -- Denormalized; updated via trigger on dept rename
  department_slug TEXT NOT NULL,            -- Denormalized; for routing without JOIN
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'send_email', 'post_social', 'send_message', 'merge_code',
      'spend_budget', 'create_document', 'run_query', 'delete_data',
      'external_api_call', 'other'
    )),
  action_label TEXT NOT NULL,               -- Human-readable description
  payload JSONB NOT NULL,                   -- The action data to execute on approval
  context TEXT,                             -- Why the department is requesting this
  risk_level TEXT NOT NULL DEFAULT 'medium'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'expired', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  execution_result JSONB,
  retry_count INTEGER DEFAULT 0            -- Track re-execution attempts
);

-- Keep department_name/slug in sync if a department is renamed
CREATE OR REPLACE FUNCTION sync_approval_department_name()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.name != NEW.name OR OLD.slug != NEW.slug THEN
    UPDATE approval_queue
    SET department_name = NEW.name, department_slug = NEW.slug
    WHERE department_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_approvals_on_dept_rename
  AFTER UPDATE OF name, slug ON departments
  FOR EACH ROW EXECUTE FUNCTION sync_approval_department_name();

CREATE INDEX idx_approval_queue_status ON approval_queue(status);
CREATE INDEX idx_approval_queue_department ON approval_queue(department_id);
CREATE INDEX idx_approval_queue_expires ON approval_queue(expires_at) WHERE status = 'pending';
