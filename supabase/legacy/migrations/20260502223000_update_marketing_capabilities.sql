
-- Migration: 20260502223000_update_marketing_capabilities.sql
-- Adds 'graphic_design' and 'image_generation' to the Marketing department.

UPDATE departments
SET capabilities = '["write_content", "draft_social_posts", "competitor_research", "email_campaigns", "graphic_design", "image_generation"]'::jsonb
WHERE slug = 'marketing' AND created_by IS NULL;
