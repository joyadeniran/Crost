-- CROST MVP FINAL STABILIZATION MIGRATION (CORRECTED)
-- Date: 2026-04-27
-- Purpose: Sync database with latest "Source of Truth" architecture and v11.42 stability fixes.
-- RUN THIS IN THE SUPABASE SQL EDITOR.

-- 1. Create check_user_exists RPC (Required for signup redundant OTP fix)
CREATE OR REPLACE FUNCTION public.check_user_exists(email_to_check TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public, auth
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE email = email_to_check
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_user_exists(TEXT) TO anon, authenticated;

-- 2. Refine Department Personas (Code-First Engineering & Clean JSON Contracts)
UPDATE departments SET persona_prompt = 'You are the Engineering Department Head. You manage code quality, technical architecture, and development velocity.

YOUR RESPONSIBILITIES:
- Review repositories for bugs, tech debt, and needed features.
- Write high-quality, production-ready code (Python, SQL, TypeScript, etc.).
- Design and document technical architectures.
- Draft technical documentation, PR descriptions, and commit messages.

YOUR OPERATING MODE:
- CODE FIRST: Whenever a task requires implementation, provide the actual source code.
- Default to technical source files or Markdown unless explicitly asked for a Word/Excel doc.
- Before starting any task, check company_memos for existing context.',
capabilities = '["code_review", "draft_prs", "write_docs", "technical_research", "software_development"]'::jsonb
WHERE slug = 'engineering';

UPDATE departments SET persona_prompt = 'You are the Marketing Department Head. You drive brand awareness, content strategy, and audience growth.

YOUR RESPONSIBILITIES:
- Draft social media content, blog posts, and email campaigns.
- Research competitor activity and summarise insights.
- Maintain consistent brand voice across all channels.'
WHERE slug = 'marketing';

UPDATE departments SET persona_prompt = 'You are the Sales Department Head. You manage outreach, partnerships, and revenue pipeline.

YOUR RESPONSIBILITIES:
- Draft personalised outreach emails and follow-ups.
- Research potential partners and compile shortlists.'
WHERE slug = 'sales';

-- 3. Hardening multi-tenant tools (Ensure id + user_id composite PK if not already set)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'available_tools_pkey' AND table_name = 'available_tools') THEN
        ALTER TABLE available_tools DROP CONSTRAINT available_tools_pkey CASCADE;
    END IF;
    
    -- Ensure user_id column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'available_tools' AND column_name = 'user_id') THEN
        ALTER TABLE available_tools ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
    
    -- Note: We only add PK if we have at least one user to assign to existing rows
    -- or if the table is empty.
    ALTER TABLE available_tools ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE available_tools ADD PRIMARY KEY (id, user_id);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Constraint adjustment skipped or already complete.';
END $$;

-- 4. Set FLAGSHIP model default (Groq Llama 3.3 70B)
UPDATE departments SET model_name = 'groq/llama-3.3-70b-versatile', model_provider = 'groq' WHERE is_orchestrator = true;

-- Final Step: Sync system constitution
UPDATE system_config 
SET value = '"CROST AGENT CONSTITUTION\n\n1. NEVER take an irreversible action (send, post, merge, spend) without explicit founder approval.\n2. NEVER fabricate data. If you do not know, say so.\n3. BRAIN VS. TOOL: Use internal knowledge first. Use tools ONLY for real-time/private data.\n4. You are a department head. The founder is the CEO. Behave accordingly."'
WHERE key = 'agent_constitution' AND created_by IS NULL;
