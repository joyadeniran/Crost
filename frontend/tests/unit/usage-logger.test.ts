/**
 * Unit tests: lib/usage-logger.ts — logUsage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertMock = vi.fn(() => Promise.resolve({ error: null }))

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: insertMock })),
  })),
}))

import { logUsage } from '@/lib/usage-logger'

beforeEach(() => {
  insertMock.mockClear()
})

describe('logUsage', () => {
  it('skips entirely when userId is falsy', async () => {
    await logUsage({
      userId: '',
      model: 'groq/llama-3.3-70b-versatile',
      keyType: 'system',
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
    })
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('derives provider from the model prefix when not supplied', async () => {
    await logUsage({
      userId: 'user-1',
      model: 'anthropic/claude-sonnet-4.6',
      keyType: 'user',
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    })
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'anthropic', user_id: 'user-1' }),
    )
  })

  it('defaults unknown model prefixes to "groq"', async () => {
    await logUsage({
      userId: 'user-1',
      model: 'unknown-provider/some-model',
      keyType: 'system',
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
    })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'groq' }))
  })

  it('uses the explicit provider when supplied, bypassing derivation', async () => {
    await logUsage({
      userId: 'user-1',
      model: 'groq/llama-3.3-70b-versatile',
      provider: 'custom-provider',
      keyType: 'system',
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
    })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ provider: 'custom-provider' }))
  })

  it('defaults goal_id/task_id to null when omitted', async () => {
    await logUsage({
      userId: 'user-1',
      model: 'groq/llama-3.3-70b-versatile',
      keyType: 'system',
      promptTokens: 10,
      completionTokens: 10,
      totalTokens: 20,
    })
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ goal_id: null, task_id: null }))
  })

  it('never throws when the insert fails', async () => {
    insertMock.mockImplementationOnce(() => Promise.reject(new Error('db down')))
    await expect(
      logUsage({
        userId: 'user-1',
        model: 'groq/llama-3.3-70b-versatile',
        keyType: 'system',
        promptTokens: 10,
        completionTokens: 10,
        totalTokens: 20,
      }),
    ).resolves.toBeUndefined()
  })
})
