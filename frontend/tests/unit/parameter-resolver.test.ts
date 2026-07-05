/**
 * Unit tests: lib/tools/parameter-resolver.ts — resolveToolParameters (T2.2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { callLLMMock } = vi.hoisted(() => ({ callLLMMock: vi.fn() }))
vi.mock('../../lib/llm-client', () => ({ callLLM: (...args: any[]) => callLLMMock(...args) }))

import { resolveToolParameters } from '@/lib/tools/parameter-resolver'

beforeEach(() => {
  callLLMMock.mockReset()
})

describe('resolveToolParameters', () => {
  it('parses valid JSON returned by the LLM', async () => {
    callLLMMock.mockResolvedValueOnce({ content: '{"to":"a@b.com","subject":"Hi","body":"Hello there"}' })
    const result = await resolveToolParameters('gmail', 'send_email', 'email a@b.com', 'user-1')
    expect(result).toEqual({ to: 'a@b.com', subject: 'Hi', body: 'Hello there' })
  })

  it('strips markdown fences before parsing', async () => {
    callLLMMock.mockResolvedValueOnce({ content: '```json\n{"channel":"#eng","text":"ship it"}\n```' })
    const result = await resolveToolParameters('slack', 'post_message', 'post to eng', 'user-1')
    expect(result).toEqual({ channel: '#eng', text: 'ship it' })
  })

  it('strips fences without a language tag', async () => {
    callLLMMock.mockResolvedValueOnce({ content: '```\n{"a":1}\n```' })
    const result = await resolveToolParameters('svc', 'action', 'cmd', 'user-1')
    expect(result).toEqual({ a: 1 })
  })

  it('salvages the outermost JSON object when a small model adds preamble', async () => {
    callLLMMock.mockResolvedValueOnce({
      content: 'Sure! Here are the parameters:\n{"to":"x@y.com","subject":"Update","body":"Hi team, quick update below."}\nLet me know if you need anything else.',
    })
    const result = await resolveToolParameters('gmail', 'send_email', 'send update to x@y.com', 'user-1')
    expect(result).toEqual({ to: 'x@y.com', subject: 'Update', body: 'Hi team, quick update below.' })
  })

  it('returns {} when the LLM output is not valid JSON', async () => {
    callLLMMock.mockResolvedValueOnce({ content: 'not json at all' })
    const result = await resolveToolParameters('gmail', 'send_email', 'x', 'user-1')
    expect(result).toEqual({})
  })

  it('returns {} when the LLM call throws', async () => {
    callLLMMock.mockRejectedValueOnce(new Error('llm down'))
    const result = await resolveToolParameters('gmail', 'send_email', 'x', 'user-1')
    expect(result).toEqual({})
  })

  it('passes the fast extraction model and includes service.action + command in the prompt', async () => {
    callLLMMock.mockResolvedValueOnce({ content: '{}' })
    await resolveToolParameters('github', 'create_pull_request', 'open a PR', 'user-9')
    expect(callLLMMock).toHaveBeenCalledWith(
      'groq/llama-3.1-8b-instant',
      expect.stringContaining('Tool: github.create_pull_request'),
      expect.any(String),
      'user-9',
    )
    expect(callLLMMock.mock.calls[0][1]).toContain('open a PR')
  })

  it('returns {} for an empty-object LLM response (nothing extractable)', async () => {
    callLLMMock.mockResolvedValueOnce({ content: '{}' })
    const result = await resolveToolParameters('gmail', 'send_email', 'vague request', 'user-1')
    expect(result).toEqual({})
  })
})
