// lib/engine/model.ts
// Model selection + the only code that talks to the LLM/LiteLLM/Gemini layer.
// Extracted verbatim from lib/llm-client.ts during the Phase 2 god-module
// split — no behavior change.

import { getModelForTask } from '@/lib/model-routing'
import { resolveApiKey } from '@/lib/key-resolver'
import { logUsage } from '@/lib/usage-logger'
import { checkTokenBudget } from './budget'
import { logEvent } from './events'
import { log } from '@/lib/log'

// ─── Config ───────────────────────────────────────────────────────────────────

// Default model — Gemini 2.0 Flash on Google Cloud Vertex AI
export const CLOUD_MODEL = process.env.CLOUD_MODEL ?? 'gemini/gemini-2.5-flash'
const CLOUD_MODEL_WORKER = process.env.CLOUD_MODEL_WORKER ?? 'gemini/gemini-2.5-flash'

export async function getModel(
  taskType: 'planning' | 'execution' | 'analysis' | 'summarization',
  userId?: string | null
): Promise<{ model: string; provider?: string }> {
  const roleMap: Record<string, string> = {
    planning: 'orc_planning',
    execution: 'tool_execution',
    analysis: 'analysis',
    summarization: 'synthesis'
  }
  const role = roleMap[taskType] || 'tool_execution'

  if (userId) {
    try {
      return await getModelForTask(userId, role)
    } catch (err) {
      log.warn('[getModel] Failed to fetch model for role, using fallback', { module: 'engine/model', userId, role, error: String(err) })
    }
  }

  const MODELS: Record<string, string> = {
    planning: process.env.CLOUD_MODEL ?? 'gemini/gemini-2.5-flash',
    execution: process.env.CLOUD_MODEL_WORKER ?? 'gemini/gemini-2.5-flash',
    analysis: process.env.CLOUD_MODEL ?? 'gemini/gemini-2.5-flash',
    summarization: process.env.CLOUD_MODEL_WORKER ?? 'gemini/gemini-2.5-flash'
  }
  const model = MODELS[taskType] || MODELS.execution
  return { model, provider: model.split('/')[0] }
}

// ─── Gemini Integration (Google Cloud Vertex AI) ─────────────────────────────

async function callLiteLLM(
  model: string,
  prompt: string,
  systemNote?: string,
  userId?: string | null,
  providerOverride?: string,
  isBootstrap?: boolean
): Promise<{ content: string; tokensUsed: number }> {
  const provider = providerOverride ?? model.split('/')[0]

  const { apiKey: _apiKey, keyType } = await resolveApiKey({ userId, provider, isBootstrap })

  if (keyType === 'system' && !isBootstrap && userId) {
    const budget = await checkTokenBudget(userId)
    if (!budget.allowed) {
      throw new Error(JSON.stringify({
        code: 'SYSTEM_LIMIT_EXCEEDED',
        tokensUsed: budget.tokensUsed,
        limit: budget.limit,
        resetAt: budget.resetAt,
        message: 'Free usage limit reached. Please add your API key to continue or wait till your limit resets.',
      }))
    }
  }

  const { callGemini } = await import('@/lib/gemini-client')
  const result = await callGemini({ model, prompt, systemNote })

  if (userId) {
    logUsage({
      userId,
      model,
      provider,
      keyType,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: result.tokensUsed,
    }).catch(() => {})
  }

  return result
}

// ─── Resilient Fallback Logic ────────────────────────────────────────────────

// Canonical fallback chain for high-reliability operations.
// Evaluated in order if the primary model fails.
const RESILIENT_FALLBACK_CHAIN = [
  'gemini/gemini-2.5-flash',            // Primary (Vertex AI, us-central1)
  'gemini/gemini-2.5-flash-lite',      // Cheaper/faster backup
  'gemini/gemini-2.5-pro',             // Strongest reasoning fallback
]

export async function callLLM(
  model: string,
  prompt: string,
  systemNote?: string,
  userId?: string | null,
  providerOverride?: string,
  isBootstrap?: boolean
): Promise<{ content: string; tokensUsed: number }> {
  // Start with the requested model
  let currentModel = model
  let attempts = 0
  const maxAttempts = 3

  // Identify if we should use the fallback chain.
  const useFallbackChain = RESILIENT_FALLBACK_CHAIN.includes(model) || model === 'cloud' || !model.startsWith('local')

  while (attempts < maxAttempts) {
    try {
      return await callLiteLLM(currentModel, prompt, systemNote, userId, providerOverride, isBootstrap)
    } catch (err: any) {
      attempts++

      // NEVER retry on system limit exceeded (billing/quota logic)
      if (err.message?.includes('SYSTEM_LIMIT_EXCEEDED')) {
        throw err
      }

      log.warn('[callLLM] Attempt failed', { module: 'engine/model', userId, model: currentModel, attempt: attempts, error: err.message })

      if (attempts >= maxAttempts || !useFallbackChain) {
        throw err // Exhausted retries or non-fallbackable model
      }

      // Select the next model in the chain
      const currentIndex = RESILIENT_FALLBACK_CHAIN.indexOf(currentModel)
      let nextModel: string | null = null

      if (currentIndex !== -1 && currentIndex < RESILIENT_FALLBACK_CHAIN.length - 1) {
        nextModel = RESILIENT_FALLBACK_CHAIN[currentIndex + 1]
      } else if (currentIndex === -1 && attempts === 1) {
        nextModel = RESILIENT_FALLBACK_CHAIN[0]
      }

      if (nextModel) {
        const switchDescription = `Automated provider fallback: ${currentModel} failed (Attempt ${attempts}). Switching to ${nextModel}.`
        log.info(`[callLLM] ${switchDescription}`, { module: 'engine/model', userId, failedModel: currentModel, nextModel, attempt: attempts })

        // SILENT LOGGING: Log to event_log for transparency without interrupting the user
        logEvent({
          event_type: 'provider_fallback',
          description: switchDescription,
          model_used: currentModel,
          metadata: {
            failed_model: currentModel,
            next_model: nextModel,
            attempt: attempts,
            error: err.message?.slice(0, 500)
          },
          created_by: userId
        }).catch(() => {})

        currentModel = nextModel
      } else {
        throw err // No more fallback options
      }
    }
  }

  throw new Error('LLM call failed after multiple fallback attempts.')
}

export async function callEmbeddings(
  input: string | string[],
  _userId?: string | null
): Promise<number[][]> {
  const { getGeminiEmbedding } = await import('@/lib/gemini-client')
  const inputs = Array.isArray(input) ? input : [input]
  const results = await Promise.all(inputs.map(text => getGeminiEmbedding(text)))
  return results
}
