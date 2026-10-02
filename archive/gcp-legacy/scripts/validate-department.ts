// scripts/validate-department.ts
// Validates a single department against all activation requirements.
// Run with: npx tsx scripts/validate-department.ts <slug>

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import * as yaml from 'js-yaml'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: npx tsx scripts/validate-department.ts <slug>')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getLiteLLMRoutes(): string[] {
  try {
    const configPath = path.resolve(__dirname, '../litellm_config.yaml')
    const raw = fs.readFileSync(configPath, 'utf-8')
    const config = yaml.load(raw) as { model_list: { model_name: string }[] }
    return config.model_list.map((m) => m.model_name)
  } catch {
    return []
  }
}

async function validate() {
  console.log(`\n🔍 Validating department: ${slug}\n`)

  const { data: dept, error } = await supabase
    .from('departments')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !dept) {
    console.error(`❌ Department "${slug}" not found.`)
    process.exit(1)
  }

  const { data: configuredTools } = await supabase
    .from('available_tools')
    .select('id')
    .eq('is_configured', true)

  const configuredToolIds = configuredTools?.map((t: { id: string }) => t.id) ?? []
  const litellmRoutes = getLiteLLMRoutes()

  const checks: { label: string; ok: boolean; detail: string }[] = []

  // 1. Persona prompt length
  checks.push({
    label: 'Persona prompt >= 50 chars',
    ok: (dept.persona_prompt?.length ?? 0) >= 50,
    detail: `${dept.persona_prompt?.length ?? 0} chars`
  })

  // 2. At least one capability
  const caps = Array.isArray(dept.capabilities) ? dept.capabilities : JSON.parse(dept.capabilities ?? '[]')
  checks.push({
    label: 'At least 1 capability declared',
    ok: caps.length > 0,
    detail: caps.length > 0 ? caps.join(', ') : 'NONE'
  })

  // 3. Onyx persona ID set
  checks.push({
    label: 'Onyx persona synced',
    ok: !!dept.onyx_persona_id && dept.onyx_persona_id !== 'SYNC_FAILED',
    detail: dept.onyx_persona_id ?? 'null'
  })

  // 4. Model exists in LiteLLM config
  checks.push({
    label: 'Model in LiteLLM config',
    ok: litellmRoutes.includes(dept.model_name),
    detail: dept.model_name + (litellmRoutes.includes(dept.model_name) ? '' : ' — NOT FOUND in litellm_config.yaml')
  })

  // 5. All tools are configured
  const tools = Array.isArray(dept.tools) ? dept.tools : JSON.parse(dept.tools ?? '[]')
  const unconfiguredTools = tools.filter((t: string) => !configuredToolIds.includes(t))
  checks.push({
    label: 'All tools configured',
    ok: unconfiguredTools.length === 0,
    detail: unconfiguredTools.length === 0
      ? tools.join(', ') || 'none'
      : `UNCONFIGURED: ${unconfiguredTools.join(', ')}`
  })

  let allPassed = true
  for (const c of checks) {
    const icon = c.ok ? '✅' : '❌'
    console.log(`${icon} ${c.label.padEnd(35)} ${c.detail}`)
    if (!c.ok) allPassed = false
  }

  console.log('\n' + (allPassed
    ? `✅ "${dept.name}" is ready for activation.`
    : `❌ "${dept.name}" has validation failures. Fix the issues above before activating.`))
  process.exit(allPassed ? 0 : 1)
}

validate()
