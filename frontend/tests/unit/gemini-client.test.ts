/**
 * Unit tests: lib/gemini-client.ts normalizeModel
 *
 * Regression for the Vertex AI 404s: gemini-2.0-flash / 1.5-flash and the
 * AI-Studio-only preview IDs are not served by the Vertex publisher endpoint
 * in our region, so normalizeModel must remap them to the model that works.
 */
import { describe, it, expect, vi } from 'vitest'

// @google/adk is heavy / not needed for normalizeModel — stub it.
vi.mock('@google/adk', () => ({ Gemini: class {} }))

const { normalizeModel, WORKING_GEMINI_MODEL } = await import('@/lib/gemini-client')

describe('normalizeModel', () => {
  it('strips the gemini/ provider prefix', () => {
    expect(normalizeModel('gemini/gemini-2.5-flash')).toBe('gemini-2.5-flash')
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

  it('remaps AI-Studio-only preview IDs to the working model', () => {
    expect(normalizeModel('gemini-2.5-flash-preview-05-20')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('gemini/gemini-2.5-flash-preview-05-20')).toBe(WORKING_GEMINI_MODEL)
  })

  it('routes non-Gemini providers to the working Gemini model', () => {
    expect(normalizeModel('groq/llama-3.3-70b-versatile')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('anthropic/claude-3')).toBe(WORKING_GEMINI_MODEL)
    expect(normalizeModel('local/llama3')).toBe(WORKING_GEMINI_MODEL)
  })

  it('passes through other valid Gemini model IDs unchanged', () => {
    expect(normalizeModel('gemini-2.5-flash')).toBe('gemini-2.5-flash')
    expect(normalizeModel('gemini-2.5-pro')).toBe('gemini-2.5-pro')
  })
})
