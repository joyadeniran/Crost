// scripts/health-check.ts
// Validates the full Crost stack is healthy.
// Run with: npx tsx scripts/health-check.ts

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

interface CheckResult {
  name: string
  ok: boolean
  detail: string
}

async function checkSupabase(): Promise<CheckResult> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await supabase
      .from('system_config')
      .select('key')
      .eq('key', 'env_mode')
      .single()

    if (error) throw new Error(error.message)
    return { name: 'Supabase', ok: !!data, detail: 'Connected, system_config readable' }
  } catch (err) {
    return { name: 'Supabase', ok: false, detail: String(err) }
  }
}

async function checkOllama(): Promise<CheckResult> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { models: unknown[] }
    return { name: 'Ollama', ok: true, detail: `Running. ${data.models?.length ?? 0} model(s) available` }
  } catch (err) {
    return { name: 'Ollama', ok: false, detail: `Not reachable at localhost:11434 — ${String(err)}` }
  }
}

async function checkLiteLLM(): Promise<CheckResult> {
  try {
    const res = await fetch('http://localhost:4000/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'local/gemma3',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5
      }),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
    return { name: 'LiteLLM', ok: true, detail: 'local/gemma3 route responding' }
  } catch (err) {
    return { name: 'LiteLLM', ok: false, detail: `Not reachable at localhost:4000 — ${String(err)}` }
  }
}

async function checkOnyx(): Promise<CheckResult> {
  try {
    const res = await fetch(`${process.env.ONYX_API_URL ?? 'http://localhost:8080'}/api/health`, {
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: 'Onyx', ok: true, detail: 'API responding' }
  } catch (err) {
    return { name: 'Onyx', ok: false, detail: `Not reachable — ${String(err)}` }
  }
}

async function main() {
  console.log('🔍 Crost Health Check\n')

  const results = await Promise.all([
    checkSupabase(),
    checkOllama(),
    checkLiteLLM(),
    checkOnyx(),
  ])

  let allPassed = true
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌'
    console.log(`${icon} ${r.name.padEnd(12)} ${r.detail}`)
    if (!r.ok) allPassed = false
  }

  console.log('\n' + (allPassed ? '✅ All systems healthy.' : '❌ One or more checks failed.'))
  process.exit(allPassed ? 0 : 1)
}

main()
