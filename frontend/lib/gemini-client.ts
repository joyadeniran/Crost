// lib/gemini-client.ts
// Google Generative AI (Gemini) client.
// On Cloud Run: uses Vertex AI with service account IAM (no API key needed).
// Locally: uses GOOGLE_AI_STUDIO_API_KEY.
// Server-side ONLY.

import { Gemini } from '@google/adk'

const GCP_PROJECT = process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? ''
const IS_GCP = !!GCP_PROJECT
const API_KEY = process.env.GOOGLE_AI_STUDIO_API_KEY ?? process.env.GEMINI_API_KEY ?? ''

// Normalize model names: strip provider prefix (e.g. 'gemini/gemini-2.0-flash' → 'gemini-2.0-flash')
export function normalizeModel(model: string): string {
  if (model.startsWith('gemini/')) return model.slice('gemini/'.length)
  if (model.startsWith('google/')) return model.slice('google/'.length)
  if (!model.startsWith('gemini-') && !model.startsWith('models/')) {
    console.warn(`[gemini-client] Unknown model "${model}", falling back to gemini-2.0-flash`)
    return 'gemini-2.0-flash'
  }
  return model
}

export function makeGeminiModel(model = 'gemini-2.0-flash'): Gemini {
  const normalized = normalizeModel(model)
  if (IS_GCP) {
    // On Cloud Run: Vertex AI uses the service account IAM automatically
    return new Gemini({ model: normalized, vertexai: true, project: GCP_PROJECT, location: 'us-central1' })
  }
  // Local dev: Google AI Studio API key
  return new Gemini({ model: normalized, apiKey: API_KEY })
}

// Simple text generation for non-ADK callers (llm-client.ts)
export async function callGemini(params: {
  model: string
  prompt: string
  systemNote?: string
  temperature?: number
}): Promise<{ content: string; tokensUsed: number }> {
  // Use @google/generative-ai for simple calls outside ADK runner
  if (!IS_GCP && !API_KEY) throw new Error('[gemini-client] GOOGLE_AI_STUDIO_API_KEY not set')

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const modelName = normalizeModel(params.model)

  // On GCP, use Vertex AI REST via google-auth-library
  if (IS_GCP) {
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
    const client = await auth.getClient()
    const token = await client.getAccessToken()

    const res = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/us-central1/publishers/google/models/${modelName}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.token}` },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
          ...(params.systemNote && { systemInstruction: { parts: [{ text: params.systemNote }] } }),
          generationConfig: { temperature: params.temperature ?? 0.3, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90_000),
      }
    )
    if (!res.ok) throw new Error(`Vertex AI error ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
    const tokens = data.usageMetadata?.totalTokenCount ?? 0
    return { content: text, tokensUsed: tokens }
  }

  // Local: Google AI Studio
  const genAI = new GoogleGenerativeAI(API_KEY)
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(params.systemNote && { systemInstruction: params.systemNote }),
    generationConfig: { temperature: params.temperature ?? 0.3, maxOutputTokens: 8192 },
  })
  const result = await model.generateContent(params.prompt)
  return {
    content: result.response.text(),
    tokensUsed: result.response.usageMetadata?.totalTokenCount ?? 0,
  }
}

export async function getGeminiEmbedding(text: string): Promise<number[]> {
  if (!IS_GCP && !API_KEY) return new Array(768).fill(0) // stub when no key

  if (IS_GCP) {
    const { GoogleAuth } = await import('google-auth-library')
    const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    const res = await fetch(
      `https://us-central1-aiplatform.googleapis.com/v1/projects/${GCP_PROJECT}/locations/us-central1/publishers/google/models/text-embedding-004:predict`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token.token}` },
        body: JSON.stringify({ instances: [{ content: text }] }),
      }
    )
    const data = await res.json()
    return data.predictions?.[0]?.embeddings?.values ?? new Array(768).fill(0)
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(API_KEY)
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' })
  const result = await model.embedContent(text)
  return result.embedding.values
}

export const GEMINI_FALLBACK_CHAIN = ['gemini-2.0-flash', 'gemini-2.5-flash-preview-05-20', 'gemini-1.5-flash']
