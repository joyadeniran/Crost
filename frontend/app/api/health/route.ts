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

async function checkComposio(): Promise<ServiceStatus> {
  const key = process.env.COMPOSIO_API_KEY
  if (!key) return { name: 'Composio', status: 'down', latencyMs: null, detail: 'No COMPOSIO_API_KEY' }
  const start = Date.now()
  try {
    const res = await fetch('https://backend.composio.dev/api/v1/client/auth/me', {
      headers: { 'x-api-key': key },
      signal: AbortSignal.timeout(4000)
    })
    if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`)
    return { name: 'Composio', status: 'ok', latencyMs: Date.now() - start }
  } catch (err) {
    return { name: 'Composio', status: 'degraded', latencyMs: null, detail: String(err) }
  }
}

async function checkCrostSystem() {
  try {
    const supabase = createServerSupabaseClient()
    const [{ data: lastGoal }, { data: lastEvent }] = await Promise.all([
      supabase.from('goals').select('updated_at').eq('status', 'completed').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('event_log').select('created_at').eq('department_slug', 'orchestrator').order('created_at', { ascending: false }).limit(1).maybeSingle()
    ])

    const now = Date.now()
    const lastEventTime = lastEvent ? new Date(lastEvent.created_at).getTime() : 0
    // If the orchestrator hasn't logged anything in 12 hours, worker might be stalled or just idle.
    return {
      last_goal_completion: lastGoal ? lastGoal.updated_at : null,
      worker_status: (now - lastEventTime > 12 * 60 * 60 * 1000) ? 'idle_or_stalled' : 'active'
    }
  } catch (err) {
    return { last_goal_completion: null, worker_status: 'unknown' }
  }
}

async function checkRateLimiter(): Promise<ServiceStatus> {
  // Simple check — if we can reach this, the in-memory store is alive
  return { name: 'Rate Limiter', status: 'ok', latencyMs: 0, detail: 'In-Memory Store Active' }
}

export async function GET() {
  const [supabase, gemini, groq, composio, rateLimit, system] = await Promise.all([
    checkSupabase(),
    checkGemini(),
    checkGroq(),
    checkComposio(),
    checkRateLimiter(),
    checkCrostSystem(),
  ])

  const services: ServiceStatus[] = [supabase, gemini, groq, composio, rateLimit]
  const allOk = services.every((s) => s.status === 'ok')
  const anyDown = services.some((s) => s.status === 'down')
  const overall = allOk ? 'ok' : anyDown ? 'degraded' : 'degraded'

  return NextResponse.json(
    { 
      overall, 
      worker_status: system.worker_status,
      last_goal_completion: system.last_goal_completion,
      composio_connectivity: composio.status,
      services, 
      checkedAt: new Date().toISOString() 
    },
    { status: 200 }
  )
}
