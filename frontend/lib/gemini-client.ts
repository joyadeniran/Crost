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

// Simple text generation for the engine (lib/engine/model.ts).
export async function callGemini(params: {
  model: string
  prompt: string
  systemNote?: string
  temperature?: number
}): Promise<{ content: string; tokensUsed: number }> {
  const apiKey = API_KEY()
  if (!apiKey) throw new Error('[gemini-client] GEMINI_API_KEY not set')

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: normalizeModel(params.model),
    ...(params.systemNote && { systemInstruction: params.systemNote }),
    generationConfig: { temperature: params.temperature ?? 0.3, maxOutputTokens: 8192 },
  })
  const result = await model.generateContent(params.prompt)
  return {
    content: result.response.text(),
    tokensUsed: result.response.usageMetadata?.totalTokenCount ?? 0,
  }
}

export const GEMINI_FALLBACK_CHAIN = [WORKING_GEMINI_MODEL, LITE_GEMINI_MODEL, PRO_GEMINI_MODEL]
