// lib/key-resolver.ts
// Unified gatekeeper for all LLM key routing.
// Rule: exactly ONE key per request — user key if valid, else system key.
// Never merges keys or passes both simultaneously.
// Server-side only — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'
import { decryptApiKey } from '@/lib/crypto'

export interface KeyResolution {
  /** null = use the system API key (Google AI Studio or Vertex AI service account) */
  apiKey: string | null
  keyType: 'user' | 'system'
}

interface ResolverParams {
  userId: string | null | undefined
  /** Canonical provider slug: 'anthropic' | 'gemini' | 'groq' | 'openai' */
  provider: string
  isBootstrap?: boolean
}

/**
 * Resolves which API key to use for an LLM call.
 *
 * Priority (evaluated in order):
 *   1. isBootstrap = true  → always system key, no DB query
 *   2. No userId           → system key (anonymous / internal call)
 *   3. Valid user BYOK     → user's decrypted key
 *   4. No valid user key   → system key fallback
 *
 * Never throws. Decrypt errors are logged and fall through to system key.
 */
export async function resolveApiKey(params: ResolverParams): Promise<KeyResolution> {
  const { userId, provider, isBootstrap = false } = params

  // Case 1: Bootstrap inference (onboarding only) — always system key
  if (isBootstrap) {
    return { apiKey: null, keyType: 'system' }
  }

  // Case 2: No authenticated user — system key
  if (!userId) {
    return { apiKey: null, keyType: 'system' }
  }

  // Case 3: Look up valid user BYOK for this provider
  try {
    const supabase = createServerSupabaseClient()
    const { data: keyRow } = await supabase
      .from('user_api_keys')
      .select('encrypted_key')
      .eq('created_by', userId)
      .eq('provider', provider)
      .eq('is_valid', true)
      .maybeSingle()

    if (keyRow?.encrypted_key) {
      const apiKey = decryptApiKey(keyRow.encrypted_key)
      return { apiKey, keyType: 'user' }
    }
  } catch (err) {
    console.warn(
      `[key-resolver] Failed to resolve user key for ${userId}/${provider}:`,
      err
    )
  }

  // Case 4: No valid user key — system key fallback
  return { apiKey: null, keyType: 'system' }
}
