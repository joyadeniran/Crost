// lib/gemini-client.ts
// Google Generative AI (Gemini) client — replaces LiteLLM proxy.
// Server-side ONLY.

import { GoogleGenerativeAI } from '@google/generative-ai'

let _genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    const key = process.env.GOOGLE_AI_STUDIO_API_KEY ?? process.env.GEMINI_API_KEY ?? ''
    if (!key) throw new Error('[gemini-client] GOOGLE_AI_STUDIO_API_KEY is not set')
    _genAI = new GoogleGenerativeAI(key)
  }
  return _genAI
}

// Normalize model names: strip provider prefix (e.g. 'gemini/gemini-2.0-flash' → 'gemini-2.0-flash')
function normalizeModel(model: string): string {
  if (model.startsWith('gemini/')) return model.slice('gemini/'.length)
  if (model.startsWith('google/')) return model.slice('google/'.length)
  // Non-Gemini models that might slip through — default to flash
  if (!model.startsWith('gemini-') && !model.startsWith('models/')) {
    console.warn(`[gemini-client] Unknown model "${model}", falling back to gemini-2.0-flash`)
    return 'gemini-2.0-flash'
  }
  return model
}

export async function callGemini(params: {
  model: string
  prompt: string
  systemNote?: string
  temperature?: number
}): Promise<{ content: string; tokensUsed: number }> {
  const modelName = normalizeModel(params.model)

  const model = getGenAI().getGenerativeModel({
    model: modelName,
    ...(params.systemNote && { systemInstruction: params.systemNote }),
    generationConfig: {
      temperature: params.temperature ?? 0.3,
      maxOutputTokens: 8192,
    },
  })

  const result = await model.generateContent(params.prompt)
  const response = result.response

  return {
    content: response.text(),
    tokensUsed: response.usageMetadata?.totalTokenCount ?? 0,
  }
}

export async function getGeminiEmbedding(text: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  return result.embedding.values
}

// Default fallback chain for Gemini models
export const GEMINI_FALLBACK_CHAIN = [
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-05-20',
  'gemini-1.5-flash',
]
