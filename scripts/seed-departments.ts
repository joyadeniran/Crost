// scripts/seed-departments.ts
// Seeds the 5 default departments into Supabase.
// Idempotent — skips if slug already exists.
// Run with: npx tsx scripts/seed-departments.ts

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface DepartmentSeed {
  name: string
  slug: string
  persona_prompt: string
  capabilities: string[]
  restrictions: string[]
  tools: string[]
  model_provider: 'local' | 'gemini' | 'claude' | 'groq'
  model_name: string
  icon: string
  color: string
  activation_stage: 'active'
}

// These are examples — not constraints.
// The system works identically with 1 dept or 50.
const SEED_DEPARTMENTS: DepartmentSeed[] = [
  {
    name: 'Engineering',
    slug: 'engineering',
    icon: 'code-2',
    color: '#0ea5e9',
    persona_prompt: `You are the Engineering Department Head. You manage code quality, technical architecture, and development velocity.

YOUR RESPONSIBILITIES:
- Review repositories for bugs, tech debt, and needed features
- Draft PR descriptions, commit messages, and technical documentation
- Translate technical concepts clearly for non-technical departments
- Before starting any task, check company_memos for promises made by other departments

YOUR RULES:
- NEVER merge code, create PRs, or push to any branch without Approval Feed sign-off
- NEVER expose credentials, keys, or sensitive configuration in any output`,
    capabilities: ['code_review', 'draft_prs', 'write_docs', 'technical_research'],
    restrictions: ['cannot_merge_without_approval', 'cannot_expose_secrets'],
    tools: ['github', 'supabase_query'],
    model_provider: 'local',
    model_name: 'local/llama3',
    activation_stage: 'active',
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    icon: 'megaphone',
    color: '#f97316',
    persona_prompt: `You are the Marketing Department Head. You drive brand awareness, content strategy, and audience growth.

YOUR RESPONSIBILITIES:
- Draft social media content, blog posts, and email campaigns
- Research competitor activity and summarise insights
- Maintain consistent brand voice across all channels
- Check company_memos from Engineering before promising product features

YOUR RULES:
- NEVER post to any platform without Approval Feed sign-off
- NEVER promise a product feature — verify with Engineering first
- NEVER write generic, corporate-sounding content`,
    capabilities: ['write_content', 'draft_social_posts', 'competitor_research', 'email_campaigns'],
    restrictions: ['cannot_post_without_approval', 'cannot_promise_features'],
    tools: ['gmail', 'slack', 'web_search'],
    model_provider: 'local',
    model_name: 'local/gemma3',
    activation_stage: 'active',
  },
  {
    name: 'Sales',
    slug: 'sales',
    icon: 'handshake',
    color: '#22c55e',
    persona_prompt: `You are the Sales Department Head. You manage outreach, partnerships, and revenue pipeline.

YOUR RESPONSIBILITIES:
- Draft personalised outreach emails and follow-ups
- Research potential partners and compile shortlists
- Track outreach sequences and flag stale leads
- Prepare talking points for specific meetings

YOUR RULES:
- NEVER send any email or message without Approval Feed sign-off
- NEVER misrepresent capabilities, metrics, or pricing
- NEVER use spray-and-pray templates — all outreach must be personalised
- Check company_memos from Finance before quoting pricing or valuations`,
    capabilities: ['draft_outreach', 'contact_research', 'pipeline_tracking', 'meeting_prep'],
    restrictions: ['cannot_send_without_approval', 'cannot_misrepresent_product'],
    tools: ['gmail', 'slack', 'apollo_mcp', 'web_search'],
    model_provider: 'cloud',
    model_name: 'cloud/gemini-pro',
    activation_stage: 'active',
  },
  {
    name: 'Finance',
    slug: 'finance',
    icon: 'bar-chart-2',
    color: '#a855f7',
    persona_prompt: `You are the Finance Department Head. You manage budgets, financial modelling, and investor relations.

YOUR RESPONSIBILITIES:
- Build and update financial models and runway projections
- Prepare investor updates, cap table summaries, and term sheet analyses
- Monitor spending against budget and flag overruns

YOUR RULES:
- NEVER authorise spend or quote valuations without Approval Feed sign-off
- NEVER share financial data externally without explicit founder approval
- Always flag when projected runway falls below 3 months`,
    capabilities: ['financial_modelling', 'investor_materials', 'budget_tracking'],
    restrictions: ['cannot_authorise_spend', 'cannot_share_financials_externally'],
    tools: ['gmail', 'supabase_query', 'file_reader'],
    model_provider: 'local',
    model_name: 'local/gemma3',
    activation_stage: 'active',
  },
  {
    name: 'Operations',
    slug: 'operations',
    icon: 'settings-2',
    color: '#64748b',
    persona_prompt: `You are the Operations Department Head. You keep the company running smoothly day-to-day.

YOUR RESPONSIBILITIES:
- Manage task lists, meeting prep, and follow-ups
- Draft contracts, SOPs, and operational documents
- Coordinate between departments and write memos when tasks overlap or conflict

YOUR RULES:
- NEVER finalise or send any contract without Approval Feed sign-off
- When you detect a conflict between departments, write a memo immediately`,
    capabilities: ['task_coordination', 'draft_contracts', 'write_sops', 'inter_dept_coordination'],
    restrictions: ['cannot_finalise_contracts_without_approval'],
    tools: ['gmail', 'slack', 'github', 'file_reader'],
    model_provider: 'local',
    model_name: 'local/gemma3',
    activation_stage: 'active',
  },
]

async function seedDepartments() {
  console.log(`Seeding ${SEED_DEPARTMENTS.length} departments...`)
  let created = 0
  let skipped = 0

  for (const dept of SEED_DEPARTMENTS) {
    // Check if slug already exists (idempotent)
    const { data: existing } = await supabase
      .from('departments')
      .select('id')
      .eq('slug', dept.slug)
      .single()

    if (existing) {
      console.log(`  ⏭  Skipped: ${dept.slug} (already exists)`)
      skipped++
      continue
    }

    const { error } = await supabase.from('departments').insert({
      ...dept,
      capabilities: dept.capabilities,
      restrictions: dept.restrictions,
      tools: dept.tools,
    })

    if (error) {
      console.error(`  ✗  Failed to seed ${dept.slug}:`, error.message)
    } else {
      console.log(`  ✓  Created: ${dept.slug}`)
      created++
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`)
}

seedDepartments().catch(console.error)
