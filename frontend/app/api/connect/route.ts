import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const GOOGLE_SERVICES = new Set(['gmail', 'googlecalendar', 'googlesheets', 'googledrive', 'google'])

export async function POST(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const body = await req.json()
    const { provider } = body
    if (!provider || typeof provider !== 'string') {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 })
    }
    const providerLower = provider.toLowerCase()
    const supabase = createServerSupabaseClient()

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    if (GOOGLE_SERVICES.has(providerLower) || providerLower.startsWith('google')) {
      // Google services: user is already authenticated via Firebase Google OAuth.
      // Mark as connected in DB — actual API calls use the Firebase ID token.
      await supabase.from('connections').upsert({
        created_by: user.id,
        service_name: providerLower,
        connection_id: 'firebase-google-oauth',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'created_by, service_name' })

      await supabase.from('available_tools').update({ is_configured: true })
        .eq('user_id', user.id)
        .or(`id.eq.${providerLower},id.like.${providerLower}_%`)

      const responseBody = { connected: true, provider: providerLower, method: 'google-oauth' }
      await completeIdempotentRequest(req, supabase, user.id, responseBody, 200)
      return NextResponse.json(responseBody)
    }

    // Non-Google services: not directly integrated in GCP stack.
    // Return instructions for manual setup via MCP or Settings.
    const responseBody = {
      connected: false,
      provider: providerLower,
      message: `${provider} integration requires manual configuration. Visit Settings → Integrations to connect via MCP.`,
      mcp_endpoint: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/mcp`,
    }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 200)
    return NextResponse.json(responseBody)
  } catch (error: any) {
    console.error('[Connect Error]:', error)
    return NextResponse.json({ error: error.message || 'Failed to process connection' }, { status: 500 })
  }
}
