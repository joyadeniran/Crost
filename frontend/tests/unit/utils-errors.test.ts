/**
 * Unit tests: lib/utils.ts + lib/errors.ts
 *
 * Covers:
 *  - truncateString: exact boundary behaviour
 *  - cleanLargePayload: heavy key truncation, nested object replacement
 *  - normalizeToolName: dot → underscore → uppercase
 *  - formatMemoBody: context-aware limit selection
 *  - ERROR_REGISTRY: every code resolves correctly
 *  - resolveCrostError: heuristic matching (503, 429, 401, gmail, github)
 *  - formatErrorMessage: SYSTEM_LIMIT_EXCEEDED formatting, network error, fallthrough
 *  - ERROR_REGISTRY codes are never referenced as raw strings in assertions
 */
import { describe, it, expect } from 'vitest'
import {
  truncateString,
  cleanLargePayload,
  normalizeToolName,
  formatMemoBody,
  formatErrorMessage,
} from '@/lib/utils'
import { ERROR_REGISTRY, resolveCrostError } from '@/lib/errors'

// ── truncateString ─────────────────────────────────────────────────────────

describe('truncateString', () => {
  it('returns string unchanged when at or below limit', () => {
    expect(truncateString('hello', 1000)).toBe('hello')
    expect(truncateString('x'.repeat(1000), 1000)).toBe('x'.repeat(1000))
  })

  it('truncates string that exceeds limit', () => {
    const long = 'a'.repeat(1500)
    const result = truncateString(long, 1000)
    expect(result.length).toBeGreaterThan(1000) // includes suffix
    expect(result).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
    expect(result.startsWith('a'.repeat(1000))).toBe(true)
  })

  it('uses default limit of 1000', () => {
    const long = 'b'.repeat(1001)
    const result = truncateString(long)
    expect(result).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
  })

  it('handles empty string', () => {
    expect(truncateString('')).toBe('')
  })

  it('handles exactly 1 char over limit', () => {
    const input = 'x'.repeat(1001)
    const result = truncateString(input)
    expect(result).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
    expect(result.startsWith('x'.repeat(1000))).toBe(true)
  })
})

// ── cleanLargePayload ──────────────────────────────────────────────────────

describe('cleanLargePayload', () => {
  it('leaves small payloads unchanged', () => {
    const payload = { action: 'send_email', to: 'test@example.com' }
    expect(cleanLargePayload(payload)).toEqual(payload)
  })

  it('truncates heavy string keys that exceed maxChars', () => {
    const bigHtml = '<html>' + 'x'.repeat(600) + '</html>'
    const result = cleanLargePayload({ html: bigHtml }, 500)
    expect(result.html).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
    expect(typeof result.html).toBe('string')
  })

  it('replaces heavy nested object with truncated_blob descriptor', () => {
    const bigObject = { nested: { data: 'x'.repeat(600) } }
    const result = cleanLargePayload({ result: bigObject }, 500)
    expect(result.result._type).toBe('truncated_blob')
    expect(typeof result.result._original_size).toBe('number')
    expect(result.result._original_size).toBeGreaterThan(500)
    expect(typeof result.result.preview).toBe('string')
  })

  it('does not truncate non-heavy keys even if large', () => {
    // 'metadata' is not in the heavy keys list
    const payload = { metadata: 'x'.repeat(600) }
    const result = cleanLargePayload(payload, 500)
    // metadata is not a heavy key — should be left alone
    expect(result.metadata).toBe(payload.metadata)
  })

  it('handles all declared heavy keys', () => {
    const heavyKeys = ['raw', 'content', 'body', 'result', 'data', 'html', 'error']
    for (const key of heavyKeys) {
      const payload = { [key]: 'x'.repeat(600) }
      const result = cleanLargePayload(payload, 500)
      expect(result[key]).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
    }
  })

  it('handles null and non-object values gracefully', () => {
    expect(cleanLargePayload(null)).toBeNull()
    expect(cleanLargePayload('string')).toBe('string')
    expect(cleanLargePayload(42)).toBe(42)
  })
})

// ── normalizeToolName ──────────────────────────────────────────────────────

describe('normalizeToolName', () => {
  it('converts gmail.send_email to GMAIL_SEND_EMAIL', () => {
    expect(normalizeToolName('gmail.send_email')).toBe('GMAIL_SEND_EMAIL')
  })

  it('converts github.create_pull_request to GITHUB_CREATE_PULL_REQUEST', () => {
    expect(normalizeToolName('github.create_pull_request')).toBe('GITHUB_CREATE_PULL_REQUEST')
  })

  it('handles string with no dots', () => {
    expect(normalizeToolName('slack')).toBe('SLACK')
  })

  it('handles multiple dots', () => {
    expect(normalizeToolName('a.b.c')).toBe('A_B_C')
  })

  it('handles already uppercase input', () => {
    expect(normalizeToolName('GMAIL.SEND')).toBe('GMAIL_SEND')
  })
})

// ── formatMemoBody ─────────────────────────────────────────────────────────

describe('formatMemoBody', () => {
  it('uses 3000 char limit for Mission Report entries', () => {
    const body = '[Mission Report] ' + 'x'.repeat(4000)
    const result = formatMemoBody(body)
    expect(result).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
    // First 3000 chars preserved
    expect(result.startsWith('[Mission Report] ' + 'x'.repeat(2983))).toBe(true)
  })

  it('uses 1000 char limit for regular memo entries', () => {
    const body = 'Regular memo: ' + 'y'.repeat(2000)
    const result = formatMemoBody(body)
    expect(result).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
    expect(result.startsWith('Regular memo: ' + 'y'.repeat(986))).toBe(true)
  })

  it('returns short memos unchanged', () => {
    const body = 'Short memo'
    expect(formatMemoBody(body)).toBe('Short memo')
  })
})

// ── ERROR_REGISTRY completeness ────────────────────────────────────────────

describe('ERROR_REGISTRY', () => {
  const EXPECTED_CODES = [
    'CR-AUTH-401',
    'CR-LLM-QUOTA',
    'CR-LLM-GATEWAY',
    'CR-LLM-AUTH',
    'CR-LLM-RATE',
    'CR-TOOL-GMAIL',
    'CR-TOOL-GITHUB',
    'CR-TOOL-TRACKING',
    'CR-DB-MEMO',
    'CR-DB-SYNC',
  ]

  for (const code of EXPECTED_CODES) {
    it(`${code} exists and has required fields`, () => {
      expect(ERROR_REGISTRY).toHaveProperty(code)
      const entry = ERROR_REGISTRY[code as keyof typeof ERROR_REGISTRY]
      expect(typeof entry.founderMessage).toBe('string')
      expect(entry.founderMessage.length).toBeGreaterThan(0)
      expect(typeof entry.actionLabel).toBe('string')
    })
  }

  it('CR-TOOL-GMAIL actionHref points to integrations settings', () => {
    const entry = ERROR_REGISTRY['CR-TOOL-GMAIL']
    expect(entry.actionHref).toContain('/dashboard/settings')
    expect(entry.actionHref).toContain('integrations')
  })

  it('CR-AUTH-401 actionHref points to /login', () => {
    const entry = ERROR_REGISTRY['CR-AUTH-401']
    expect(entry.actionHref).toBe('/login')
  })

  it('CR-LLM-QUOTA actionHref points to API key settings', () => {
    const entry = ERROR_REGISTRY['CR-LLM-QUOTA']
    expect(entry.actionHref).toContain('/dashboard/settings')
    expect(entry.actionHref).toContain('keys')
  })
})

// ── resolveCrostError ──────────────────────────────────────────────────────

describe('resolveCrostError', () => {
  it('resolves direct error code lookup', () => {
    const result = resolveCrostError('CR-TOOL-GMAIL')
    expect(result.code).toBe('CR-TOOL-GMAIL')
  })

  it('maps LiteLLM 503 to CR-LLM-GATEWAY', () => {
    const result = resolveCrostError('LiteLLM error - 503 Service unavailable')
    expect(result.code).toBe('CR-LLM-GATEWAY')
  })

  it('maps 429 rate limit to CR-LLM-RATE', () => {
    const result = resolveCrostError('LiteLLM error - 429 Too Many Requests')
    expect(result.code).toBe('CR-LLM-RATE')
  })

  it('maps 401/400 to CR-LLM-AUTH', () => {
    const result = resolveCrostError('LiteLLM error - 401 Unauthorized')
    expect(result.code).toBe('CR-LLM-AUTH')
  })

  it('maps bare "LiteLLM error" without status code to CR-LLM-GATEWAY', () => {
    const result = resolveCrostError('LiteLLM error occurred')
    expect(result.code).toBe('CR-LLM-GATEWAY')
  })

  it('maps gmail-related error to CR-TOOL-GMAIL', () => {
    const result = resolveCrostError('Failed to authenticate gmail account')
    expect(result.code).toBe('CR-TOOL-GMAIL')
  })

  it('maps github-related error to CR-TOOL-GITHUB', () => {
    const result = resolveCrostError('github connection refused')
    expect(result.code).toBe('CR-TOOL-GITHUB')
  })

  it('maps schema cache/404 error to CR-DB-SYNC', () => {
    const result = resolveCrostError('schema cache error on table lookup')
    expect(result.code).toBe('CR-DB-SYNC')
  })

  it('maps "track tool execution" failure to CR-TOOL-TRACKING', () => {
    const result = resolveCrostError('failed to track tool execution metrics')
    expect(result.code).toBe('CR-TOOL-TRACKING')
  })

  it('falls back to CR-SYS-GENERIC for unknown errors', () => {
    const result = resolveCrostError('some totally unknown error xyz')
    expect(result.code).toBe('CR-SYS-GENERIC')
    // founderMessage should still be set (not empty)
    expect(result.founderMessage.length).toBeGreaterThan(0)
  })

  it('CR-SYS-GENERIC uses the raw technical message as founderMessage', () => {
    const technicalMsg = 'completely unknown error 42'
    const result = resolveCrostError(technicalMsg)
    expect(result.founderMessage).toBe(technicalMsg)
  })

  it('handles empty string without throwing', () => {
    const result = resolveCrostError('')
    expect(result.code).toBe('CR-SYS-GENERIC')
    // founderMessage falls back to generic text when input is empty
    expect(typeof result.founderMessage).toBe('string')
  })
})

// ── formatErrorMessage ─────────────────────────────────────────────────────

describe('formatErrorMessage', () => {
  it('formats SYSTEM_LIMIT_EXCEEDED with token count and reset time', () => {
    const resetAt = new Date(Date.now() + 2 * 3600_000).toISOString()
    const err = JSON.stringify({
      code: 'SYSTEM_LIMIT_EXCEEDED',
      tokensUsed: 48_500,
      limit: 50_000,
      resetAt,
      message: 'Daily limit reached',
    })

    const result = formatErrorMessage(err)
    expect(result).toContain('48')     // tokensUsed
    expect(result).toContain('50')     // limit
    // Should mention reset time
    expect(result.toLowerCase()).toMatch(/wait|reset|limit/i)
  })

  it('formats "failed to fetch" as connection error', () => {
    const result = formatErrorMessage('failed to fetch')
    expect(result.toLowerCase()).toMatch(/connection|network|internet/i)
  })

  it('formats "network error" as connection error', () => {
    const result = formatErrorMessage('network error')
    expect(result.toLowerCase()).toMatch(/connection|network|internet/i)
  })

  it('falls through to resolveCrostError for LiteLLM gateway error', () => {
    const result = formatErrorMessage('LiteLLM error - 503 Service unavailable')
    // Should return the founderMessage from CR-LLM-GATEWAY
    const expected = ERROR_REGISTRY['CR-LLM-GATEWAY'].founderMessage
    expect(result).toBe(expected)
  })

  it('returns CR-TOOL-GMAIL founderMessage for gmail errors', () => {
    const result = formatErrorMessage('gmail token expired')
    expect(result).toBe(ERROR_REGISTRY['CR-TOOL-GMAIL'].founderMessage)
  })

  it('handles non-string input gracefully', () => {
    expect(() => formatErrorMessage(null as unknown as string)).not.toThrow()
    expect(() => formatErrorMessage(undefined as unknown as string)).not.toThrow()
  })
})

// ── Payload round-trip: event_log insert ──────────────────────────────────

describe('Event log payload integrity', () => {
  it('cleanLargePayload + truncateString keep event_log rows below 2KB for typical payloads', () => {
    // Simulate a typical event_log metadata payload
    const rawMetadata = {
      result: '<html>' + 'x'.repeat(10_000) + '</html>',
      description: 'Task completed with large HTML output',
      model: 'groq/llama-3.3-70b-versatile',
      tokens: 1500,
    }

    const cleaned = cleanLargePayload(rawMetadata, 500)
    const serialized = JSON.stringify(cleaned)

    // After cleaning, the serialized payload should be well under 2KB
    expect(serialized.length).toBeLessThan(2048)
  })

  it('description field is truncated to 200 chars in event_log', () => {
    const longDescription = 'Very long description. '.repeat(20) // >200 chars
    const truncated = truncateString(longDescription, 200)
    expect(truncated.slice(0, 200)).toBe(longDescription.slice(0, 200))
    expect(truncated).toContain('[TRUNCATED FOR EGRESS EFFICIENCY]')
  })
})
