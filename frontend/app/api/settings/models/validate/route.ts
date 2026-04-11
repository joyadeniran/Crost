import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || 'http://localhost:4000'
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || ''

// Map provider to test models (must match LiteLLM config.yaml)
const TEST_MODELS: Record<string, string> = {
  'claude': 'claude-sonnet-4.6',
  'gemini': 'gemini-1.5-flash',
  'groq': 'llama-3.3-70b-versatile'
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { provider, api_key } = await req.json()

    if (!provider || !api_key) {
      return NextResponse.json(
        { error: 'provider and api_key required' },
        { status: 400 }
      )
    }

    // Test API key by making a simple request to LiteLLM
    const testModel = TEST_MODELS[provider]
    if (!testModel) {
      return NextResponse.json(
        { error: `Unknown provider: ${provider}` },
        { status: 400 }
      )
    }

    const testResponse = await fetch(`${LITELLM_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LITELLM_MASTER_KEY}`
      },
      body: JSON.stringify({
        model: `${provider}/${testModel}`,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        extra_body: {
          api_key: api_key
        }
      })
    })

    if (!testResponse.ok) {
      return NextResponse.json(
        { error: 'API key validation failed', valid: false },
        { status: 200 }
      )
    }

    // Store encrypted key
    const { error: insertError } = await supabase
      .from('user_api_keys')
      .upsert(
        {
          created_by: user.id,
          provider,
          encrypted_key: api_key, // In production, encrypt this
          is_valid: true,
          last_validated_at: new Date().toISOString()
        },
        { onConflict: 'created_by,provider' }
      )

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ valid: true, success: true })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message, valid: false },
      { status: 500 }
    )
  }
}
