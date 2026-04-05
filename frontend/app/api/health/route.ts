// GET /api/health — checks connectivity to all services
// Returns status for Supabase, Onyx, LiteLLM, Ollama

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const revalidate = 0

interface ServiceStatus {
  name: string
  status: 'ok' | 'degraded' | 'down'
  latencyMs: number | null
  detail?: string
}

async function checkSupabase(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('system_config').select('key').limit(1)
    if (error) throw error
    return { name: 'Supabase', status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    return { name: 'Supabase', status: 'down', latencyMs: null, detail: String(err) }
  }
}

async function checkOnyx(): Promise<ServiceStatus> {
  const start = Date.now()
  const base = process.env.ONYX_BASE_URL ?? 'http://localhost:3000'
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: 'Onyx', status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    const msg = String(err)
    const isConnRefused = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('timeout')
    return {
      name: 'Onyx',
      status: isConnRefused ? 'down' : 'degraded',
      latencyMs: null,
      detail: isConnRefused ? 'Not running — start Docker stack' : msg,
    }
  }
}

async function checkLiteLLM(): Promise<ServiceStatus> {
  const start = Date.now()
  const base = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000'
  try {
    // Use /healthz (liveness) not /health (checks all backends — hangs when Ollama is slow)
    const res = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: 'LiteLLM', status: 'ok', latencyMs: Date.now() - start, detail: 'Proxy running' }
  } catch (err) {
    const msg = String(err)
    const isDown = msg.includes('ECONNREFUSED') || msg.includes('fetch failed')
      || msg.includes('timeout') || msg.includes('abort') || msg.includes('TimeoutError')
    return {
      name: 'LiteLLM',
      status: isDown ? 'down' : 'degraded',
      latencyMs: null,
      detail: isDown ? 'Not running — run: litellm --config litellm_config.yaml --port 4000' : msg,
    }
  }
}

async function checkOllama(): Promise<ServiceStatus> {
  const start = Date.now()
  const base = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as { models?: { name: string }[] }
    const models = json.models?.map((m) => m.name) ?? []
    return {
      name: 'Ollama',
      status: 'ok',
      latencyMs: Date.now() - start,
      detail: models.length ? `Models: ${models.join(', ')}` : 'Running — no models pulled',
    }
  } catch (err) {
    const msg = String(err)
    const isDown = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('timeout')
    return {
      name: 'Ollama',
      status: isDown ? 'down' : 'degraded',
      latencyMs: null,
      detail: isDown ? 'Not running — install Ollama & pull gemma3:4b' : msg,
    }
  }
}

async function checkGemini(): Promise<ServiceStatus> {
  const key = process.env.GOOGLE_AI_STUDIO_API_KEY
  if (!key) {
    return { name: 'Gemini (Cloud)', status: 'down', latencyMs: null, detail: 'No GOOGLE_AI_STUDIO_API_KEY in .env.local' }
  }
  const start = Date.now()
  try {
    // Use models list endpoint — lightweight, no tokens consumed
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (res.status === 403) {
      const body = await res.json() as { error?: { message?: string } }
      const msg = body.error?.message ?? 'API_KEY_SERVICE_BLOCKED'
      return {
        name: 'Gemini (Cloud)',
        status: 'down',
        latencyMs: null,
        detail: msg.includes('SERVICE_DISABLED') || msg.includes('BLOCKED')
          ? 'API not enabled — visit console.cloud.google.com → Enable "Generative Language API"'
          : msg,
      }
    }
    if (res.status === 400) {
      return { name: 'Gemini (Cloud)', status: 'down', latencyMs: null, detail: 'Invalid API key' }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: 'Gemini (Cloud)', status: 'ok', latencyMs: Date.now() - start, detail: 'Key valid' }
  } catch (err) {
    const msg = String(err)
    return {
      name: 'Gemini (Cloud)',
      status: 'degraded',
      latencyMs: null,
      detail: msg.includes('timeout') ? 'Request timed out' : msg,
    }
  }
}

async function checkGroq(): Promise<ServiceStatus> {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    return { name: 'Groq (Cloud)', status: 'down', latencyMs: null, detail: 'No GROQ_API_KEY — get one free at console.groq.com' }
  }
  const start = Date.now()
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    })
    if (res.status === 401) {
      return { name: 'Groq (Cloud)', status: 'down', latencyMs: null, detail: 'Invalid API key' }
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: 'Groq (Cloud)', status: 'ok', latencyMs: Date.now() - start, detail: 'Key valid' }
  } catch (err) {
    const msg = String(err)
    return {
      name: 'Groq (Cloud)',
      status: 'degraded',
      latencyMs: null,
      detail: msg.includes('timeout') ? 'Request timed out' : msg,
    }
  }
}

export async function GET() {
  const [supabase, onyx, litellm, ollama, gemini, groq] = await Promise.all([
    checkSupabase(),
    checkOnyx(),
    checkLiteLLM(),
    checkOllama(),
    checkGemini(),
    checkGroq(),
  ])

  const services: ServiceStatus[] = [supabase, onyx, litellm, ollama, gemini, groq]
  const allOk = services.every((s) => s.status === 'ok')
  const anyDown = services.some((s) => s.status === 'down')
  const overall = allOk ? 'ok' : anyDown ? 'degraded' : 'degraded'

  return NextResponse.json(
    { overall, services, checkedAt: new Date().toISOString() },
    { status: 200 }
  )
}
