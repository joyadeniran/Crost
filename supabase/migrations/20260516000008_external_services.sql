-- Migration: external_services table
-- Registry of external vendors Orc can recommend when internal capabilities are missing.
-- Orc uses this for Tier 3 gap escalation (ORC_ORCHESTRATION_UPGRADE_PLAN.md §B.3)

CREATE TABLE IF NOT EXISTS external_services (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name              TEXT        NOT NULL,
  category                  TEXT        NOT NULL,   -- maps to capability_inventory.capability_type
  when_to_use               TEXT,                   -- plain-English condition for Orc to evaluate
  recommended_vendors       TEXT[]      DEFAULT '{}',
  estimated_cost_range      TEXT,                   -- "$200-500", "negotiate", etc.
  turnaround_time           TEXT,                   -- "24-48 hours", "2 weeks"
  founder_decision_required BOOLEAN     DEFAULT true,
  orc_can_brief             BOOLEAN     DEFAULT true,  -- can Orc draft a hiring brief?
  status                    TEXT        DEFAULT 'available'
    CHECK (status IN ('available', 'blocked_by_budget', 'blocked_by_founder_preference')),
  related_capability_slug   TEXT        REFERENCES capability_inventory(capability_slug) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_svc_status   ON external_services (status);
CREATE INDEX IF NOT EXISTS idx_ext_svc_category ON external_services (category);
CREATE INDEX IF NOT EXISTS idx_ext_svc_cap_slug ON external_services (related_capability_slug);

-- ─── Initial seed ─────────────────────────────────────────────────────────────
INSERT INTO external_services
  (service_name, category, when_to_use, recommended_vendors, estimated_cost_range, turnaround_time, founder_decision_required, orc_can_brief, related_capability_slug)
VALUES
  (
    'Video Editing',
    'external_service',
    'When founder requests a video, animation, or screen recording that requires post-production',
    ARRAY['Fiverr', 'Upwork', 'Motion Array'],
    '$200-500',
    '24-48 hours',
    true,
    true,
    'ext.video_editing'
  ),
  (
    'Legal Review',
    'external_service',
    'When a contract, policy, or legal document needs attorney sign-off beyond template use',
    ARRAY['Clerky', 'Stripe Atlas Legal', 'UpCounsel'],
    '$500-2000',
    '3-5 business days',
    true,
    true,
    'ext.legal_review'
  ),
  (
    'Financial Audit',
    'external_service',
    'When investor due diligence or regulatory compliance requires CPA-level financial review',
    ARRAY['Pilot.com', 'Kruze Consulting', 'local CPA'],
    '$2000-10000',
    '2-4 weeks',
    true,
    true,
    'ext.financial_audit'
  ),
  (
    'Brand Identity Design',
    'external_service',
    'When founder needs a full visual identity system (logo, color palette, typography) beyond content generation',
    ARRAY['99designs', 'Dribbble freelancers', 'Looka'],
    '$500-3000',
    '1-2 weeks',
    true,
    true,
    NULL
  ),
  (
    'Data Engineering',
    'external_service',
    'When the goal requires production-grade data pipelines, warehouses, or BI infrastructure beyond analytics scripts',
    ARRAY['Toptal', 'Upwork senior engineers', 'Fiverr Pro'],
    '$1500-5000',
    '1-3 weeks',
    true,
    true,
    NULL
  )
ON CONFLICT DO NOTHING;
