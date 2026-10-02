-- Company facts: the founder-confirmed record of figures and claims (pattern from Timbus).
-- Only the founder writes these (directly, or by confirming a fact Orc proposed in chat); department
-- output never becomes a fact. Rows are never edited: a new value retires the old row
-- (active = false, superseded_at) so history stays queryable.
CREATE TABLE IF NOT EXISTS company_facts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     TEXT        NOT NULL,
  key            TEXT        NOT NULL CHECK (key ~ '^[a-z0-9_]{1,60}$'),
  value          TEXT        NOT NULL CHECK (char_length(value) BETWEEN 1 AND 500),
  as_of          DATE,
  source         TEXT        CHECK (source IS NULL OR char_length(source) <= 200),
  volatile       BOOLEAN     NOT NULL DEFAULT FALSE,
  -- A claim that must never be made again (retired price, superseded figure).
  prohibited     BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Where the founder confirmed it: 'chat', 'settings'.
  origin         TEXT        NOT NULL DEFAULT 'settings',
  active         BOOLEAN     NOT NULL DEFAULT TRUE,
  superseded_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One live value per key per founder.
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_facts_live_key ON company_facts (created_by, key) WHERE active;
CREATE INDEX IF NOT EXISTS idx_company_facts_owner ON company_facts (created_by, active);

-- Same access model as every other table: RLS on, no policies, nothing for the Data API roles.
ALTER TABLE company_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON company_facts FROM anon, authenticated, service_role;
