/**
 * Unit tests: lib/gemini-client.ts normalizeModel
 *
 * Regression for the Vertex AI 404s: gemini-2.0-flash / 1.5-flash and the
 * AI-Studio-only preview IDs are not served by the Vertex publisher endpoint
 * in our region, so normalizeModel must remap them to the model that works.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

// @google/adk is heavy / not needed for normalizeModel — stub it.
vi.mock('@google/adk', () => ({ Gemini: class {} }))

const { normalizeModel, WORKING_GEMINI_MODEL } = await import('@/lib/gemini-client')

describe('normalizeModel', () => {
  it('strips the gemini/ provider prefix', () => {
    expect(normalizeModel('gemini/gemini-3.8-flash')).toBe('gemini-3.8-flash')
  })

  it('remaps the retired gemini-2.5 family (404 for new API users) to the working model', () => {
    expect(normalizeModel('gemini/gemini-2.5-flash')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini-2.5-flash-lite')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini-2.5-pro')).toBe(WORKING_GEMINI_MODEL)
  })

  it('remaps retired gemini-2.0-flash to the working model', () => {
    expect(normalizeModel('gemini/gemini-2.0-flash')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini-2.0-flash')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini-2.0-flash-001')).toBe(WORKING_GEMINI_MODEL)
  })

  it('remaps retired gemini-1.5 family to the working model', () => {
    expect(normalizeModel('gemini-1.5-flash')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini-1.5-flash-002')).toBe(WORKING_GEMINI_MODEL)
  })

  it('remaps old 2.x preview IDs but keeps current 3.x preview IDs', () => {
    expect(normalizeModel('gemini-2.5-flash-preview-05-20')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini-3.1-pro-preview')).toBe('gemini-3.1-pro-preview')
  })

  it('routes non-Gemini providers to the working Gemini model', () => {
    expect(normalizeModel('groq/llama-3.3-70b-versatile')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('anthropic/claude-3')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('local/llama3')).toBe(WORKING_GEMINI_MODEL)
  })

  it('passes through other valid Gemini model IDs unchanged', () => {
    expect(normalizeModel('gemini-3.8-flash')).toBe('gemini-3.8-flash')
    expect(normalizeModel('gemini-3.5-flash-lite')).toBe('gemini-3.5-flash-lite')
  })
})

// ─── callGemini (engine calls: department work, plans, reports) — thinking level and stall timeout ───
const seen: any[] = []
function mockSdk(behaviour: 'ok' | 'reject-thinking' | 'hang' | 'fail') {
  vi.doMock('@google/generative-ai', () => ({
    GoogleGenerativeAI: class {
      getGenerativeModel({ model, generationConfig }: { model: string; generationConfig: any }) {
        seen.push({ model, ...generationConfig })
        return {
          async generateContent(_p: string, opts?: { signal?: AbortSignal }) {
            if (behaviour === 'hang') return new Promise((_, reject) => opts?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
            if (behaviour === 'fail') throw new Error('[503] overloaded')
            if (behaviour === 'reject-thinking' && generationConfig.thinkingConfig) throw new Error('[400 Bad Request] Invalid JSON payload: unknown field thinkingConfig')
            return { response: { text: () => 'done', usageMetadata: { totalTokenCount: 7 } } }
          },
        }
      }
    },
  }))
}

async function load(behaviour: Parameters<typeof mockSdk>[0]) {
  vi.resetModules()
  seen.length = 0
  mockSdk(behaviour)
  process.env.GEMINI_API_KEY = 'k'
  return (await import('@/lib/gemini-client')).callGemini
}

afterEach(() => { vi.doUnmock('@google/generative-ai') })

describe('callGemini', () => {
  it('asks Flash for low thinking and Flash-Lite for minimal', async () => {
    const callGemini = await load('ok')
    expect(await callGemini({ model: 'gemini/gemini-3.8-flash', prompt: 'p' })).toEqual({ content: 'done', tokensUsed: 7 })
    await callGemini({ model: 'gemini-3.5-flash-lite', prompt: 'p' })
    expect(seen[0]).toMatchObject({ model: 'gemini-3.8-flash', thinkingConfig: { thinkingLevel: 'low' } })
    expect(seen[1]).toMatchObject({ model: 'gemini-3.5-flash-lite', thinkingConfig: { thinkingLevel: 'minimal' } })
  })

  it('retries the same model without the thinking setting if it is rejected', async () => {
    const callGemini = await load('reject-thinking')
    expect((await callGemini({ model: 'gemini-3.8-flash', prompt: 'p' })).content).toBe('done')
    expect(seen).toHaveLength(2)
    expect(seen[1].thinkingConfig).toBeUndefined()
  })

  it('gives up on a stalled call (so callLLM can fall back) instead of hanging', async () => {
    const callGemini = await load('hang')
    await expect(callGemini({ model: 'gemini-3.8-flash', prompt: 'p', timeoutMs: 30 })).rejects.toThrow(/timed out/)
    expect(seen).toHaveLength(1) // a timeout is not retried on the same model
  })

  it('passes other errors straight to the caller', async () => {
    const callGemini = await load('fail')
    await expect(callGemini({ model: 'gemini-3.8-flash', prompt: 'p' })).rejects.toThrow('503')
    expect(seen).toHaveLength(1)
  })
})
