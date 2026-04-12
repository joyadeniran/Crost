// lib/usage-logger.ts
// Writes one billing row to api_usage_logs per successful LLM call.
// Separate from logEvent() — this is billing/quota data, not system events.
// Server-side only — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'
import { estimateCost } from '@/lib/cost-table'

const CANONICAL_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'groq'])

function extractProvider(model: string): string {
  const prefix = model.split('/')[0]
  return CANONICAL_PROVIDERS.has(prefix) ? prefix : 'groq'
}

export interface LogUsageInput {
  userId: string
  model: string
  /** Optional — derived from model prefix if omitted */
  provider?: string
  keyType: 'user' | 'system'
  promptTokens: number
  completionTokens: number
  totalTokens: number
  goalId?: string | null
  taskId?: string | null
}

/**
 * Write one row to api_usage_logs. Fire-and-forget — never throws.
 * Skips entirely when userId is falsy (internal/system calls with no session).
 */
export async function logUsage(input: LogUsageInput): Promise<void> {
  // Decision: DO NOT log when userId is null/undefined
  if (!input.userId) return

  try {
    const provider = input.provider ?? extractProvider(input.model)
    const cost = estimateCost(input.model, input.promptTokens, input.completionTokens)

    const supabase = createServerSupabaseClient()
    await supabase.from('api_usage_logs').insert({
      user_id:           input.userId,
      model:             input.model,
      provider,
      key_type:          input.keyType,
      prompt_tokens:     input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens:      input.totalTokens,
      cost_estimate:     cost,
      goal_id:           input.goalId ?? null,
      task_id:           input.taskId ?? null,
    })
  } catch (err) {
    // Never rethrow — usage logging must not block LLM responses
    console.error('[logUsage] Failed to write usage log:', err)
  }
}
