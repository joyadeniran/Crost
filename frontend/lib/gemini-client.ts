// lib/gemini-client.ts
// Gemini via the Google AI (Generative Language) API — GEMINI_API_KEY only.
// Server-side ONLY.

const API_KEY = () => process.env.GEMINI_API_KEY ?? ''

import { WORKING_GEMINI_MODEL, LITE_GEMINI_MODEL, PRO_GEMINI_MODEL } from './gemini-models'
export { WORKING_GEMINI_MODEL, LITE_GEMINI_MODEL, PRO_GEMINI_MODEL }

// Normalize model names: strip provider prefix and remap retired / non-Gemini
// IDs to the model we actually serve.
// e.g. 'gemini/gemini-2.5-flash' → WORKING_GEMINI_MODEL
export function normalizeModel(model: string): string {
  let m = model
  if (m.startsWith('gemini/')) m = m.slice('gemini/'.length)
  else if (m.startsWith('google/')) m = m.slice('google/'.length)

  if (!m.startsWith('gemini-') && !m.startsWith('models/')) return WORKING_GEMINI_MODEL
  // Retired families (1.x, 2.x) are remapped to the current primary model.
  if (/^gemini-(1\.|2\.)/.test(m)) return WORKING_GEMINI_MODEL
  return m
}

/**
 * One engine call may take this long before it is abandoned. Gemini sometimes stalls with no
 * error; a thrown timeout lets callLLM move on to the next model instead of the task sitting
 * "Working" until the function is killed.
 */
export const GEMINI_CALL_TIMEOUT_MS = 60_000

/**
 * Thinking is the slow part of a Gemini call. Department work and reports ask for "low"
 * (Flash-Lite: "minimal"); if a model rejects the setting, the call is retried without it.
 */
function thinkingVariants(model: string): Array<Record<string, unknown>> {
  return [{ thinkingConfig: { thinkingLevel: /lite/i.test(model) ? 'minimal' : 'low' } }, {}]
}

// Simple text generation for the engine (lib/engine/model.ts).
export async function callGemini(params: {
  model: string
  prompt: string
  systemNote?: string
  temperature?: number
  timeoutMs?: number
}): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = API_KEY()
  if (!apiKey) throw new Error('[gemini-client] GEMINI_API_KEY not set')

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const modelName = normalizeModel(params.model)
  const timeoutMs = params.timeoutMs ?? GEMINI_CALL_TIMEOUT_MS
  let lastErr: unknown
  for (const extra of thinkingVariants(modelName)) {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ac.abort(); reject(new Error(`[gemini-client] ${modelName} timed out after ${timeoutMs}ms`)) }, timeoutMs)
    })
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        ...(params.systemNote && { systemInstruction: params.systemNote }),
        generationConfig: { temperature: params.temperature ?? 0.3, maxOutputTokens: 8192, ...extra } as any,
      })
      const result = await Promise.race([model.generateContent(params.prompt, { signal: ac.signal }), timeout])
      return {
        content: result.response.text(),
        tokensUsed: result.response.usageMetadata?.totalTokenCount ?? 0,
      }
    } catch (err) {
      lastErr = err
      const msg = String((err as Error)?.message ?? err)
      // Only a rejected thinking setting is retried on the same model; anything else → caller's fallback.
      if (!(Object.keys(extra).length > 0 && !/timed out/.test(msg) && /400|invalid|unknown|thinking/i.test(msg))) throw err
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

export const GEMINI_FALLBACK_CHAIN = [WORKING_GEMINI_MODEL, LITE_GEMINI_MODEL, PRO_GEMINI_MODEL]
