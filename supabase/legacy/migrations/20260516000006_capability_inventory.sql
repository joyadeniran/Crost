-- Migration: capability_inventory table
-- Brain 3 (Realism) from ORC_ORCHESTRATION_UPGRADE_PLAN.md §B.1
-- Global registry of what Orc/departments/tools can actually do.
-- Seeded with core capabilities; updated by system as tools connect/disconnect.

CREATE TABLE IF NOT EXISTS capability_inventory (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_type      TEXT        NOT NULL
    CHECK (capability_type IN ('department_skill', 'tool', 'external_service', 'skill_layer')),
  capability_slug      TEXT        NOT NULL UNIQUE,
  display_name         TEXT        NOT NULL,
  description          TEXT,
  cost_per_use         JSONB       DEFAULT '{}',  -- { api_calls, tokens, credit_cost }
  rate_limits          JSONB       DEFAULT '{}',  -- { calls_per_hour, concurrent }
  success_rate         FLOAT       DEFAULT 1.0
    CHECK (success_rate >= 0.0 AND success_rate <= 1.0),
  last_successful_use  TIMESTAMPTZ,
  last_failure         TIMESTAMPTZ,
  failure_reason       TEXT,
  status               TEXT        DEFAULT 'available'
    CHECK (status IN ('available', 'degraded', 'unavailable', 'experimental')),
  requires_connection  BOOLEAN     DEFAULT false,
  requires_approval    BOOLEAN     DEFAULT false,
  alternatives         TEXT[]      DEFAULT '{}',
  metadata             JSONB       DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- No per-user RLS — capability inventory is global system data
CREATE INDEX IF NOT EXISTS idx_cap_inv_type_status
  ON capability_inventory (capability_type, status);

CREATE INDEX IF NOT EXISTS idx_cap_inv_slug
  ON capability_inventory (capability_slug);

-- ─── Initial seed: core department skills ────────────────────────────────────
INSERT INTO capability_inventory
  (capability_type, capability_slug, display_name, description, status, requires_approval)
VALUES
  -- Marketing
  ('department_skill', 'marketing.content_creation',  'Content Creation',       'Blog posts, social content, newsletters, marketing copy',        'available', false),
  ('department_skill', 'marketing.brand_guidelines',  'Brand Guidelines',       'Brand voice, visual identity, messaging frameworks',             'available', false),
  ('department_skill', 'marketing.social_strategy',   'Social Media Strategy',  'Platform strategy, content calendars, audience targeting',       'available', false),
  ('department_skill', 'marketing.image_generation',  'Image Generation',       'AI-generated images for marketing materials',                    'available', false),
  -- Engineering
  ('department_skill', 'engineering.code_review',     'Code Review',            'Pull request reviews, architecture feedback, best practices',    'available', false),
  ('department_skill', 'engineering.api_design',      'API Design',             'REST/GraphQL API specification, schema design',                  'available', false),
  ('department_skill', 'engineering.script_automation','Script Automation',     'Python/JS scripts for data processing and automation',           'available', false),
  ('department_skill', 'engineering.data_analysis',   'Data Analysis',          'SQL queries, data interpretation, reporting',                    'available', false),
  -- Sales
  ('department_skill', 'sales.pitch_crafting',        'Pitch Crafting',         'Sales decks, investor pitches, customer presentations',          'available', false),
  ('department_skill', 'sales.outreach_sequencing',   'Outreach Sequencing',    'Email sequences, follow-up cadences, cold outreach',             'available', false),
  ('department_skill', 'sales.crm_management',        'CRM Management',         'Pipeline tracking, deal stages, contact management',             'available', false),
  -- Finance
  ('department_skill', 'finance.financial_modeling',  'Financial Modeling',     'Revenue projections, unit economics, burn rate analysis',        'available', false),
  ('department_skill', 'finance.pricing_analysis',    'Pricing Analysis',       'Pricing strategy, competitive benchmarking, packaging',          'available', false),
  ('department_skill', 'finance.metrics_dashboard',   'Metrics Dashboard',      'KPI tracking, growth metrics, investor-ready summaries',         'available', false),
  -- Legal
  ('department_skill', 'legal.contract_templates',    'Contract Templates',     'NDAs, MSAs, employment agreements, SaaS contracts',             'available', false),
  ('department_skill', 'legal.privacy_policies',      'Privacy Policies',       'GDPR-compliant privacy policies, terms of service',             'available', false),
  -- Skill layers (output formats)
  ('skill_layer', 'skill.docx_generation',  'Word Document Generation',    'Structured document output as .docx files',  'available', false),
  ('skill_layer', 'skill.xlsx_generation',  'Excel Spreadsheet Generation','Tabular data output as .xlsx files',         'available', false),
  ('skill_layer', 'skill.pptx_generation',  'PowerPoint Generation',       'Presentation slides as .pptx files',         'available', false),
  -- External services (unavailable by default — require founder approval + external hire)
  ('external_service', 'ext.video_editing',    'Video Editing',    'Professional video production and editing',  'unavailable', true),
  ('external_service', 'ext.legal_review',     'Legal Review',     'Attorney review and legal advice',           'unavailable', true),
  ('external_service', 'ext.financial_audit',  'Financial Audit',  'CPA-level financial auditing',               'unavailable', true)
ON CONFLICT (capability_slug) DO NOTHING;
