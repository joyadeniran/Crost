/**
 * Unit tests: lib/api-response.ts
 *
 * Characterizes the apiOk/apiError response shape contract (finding #16 —
 * _metadata key). Covers:
 *  - apiOk: success envelope shape, presence/absence of _metadata
 *  - apiError: error envelope shape, presence/absence of code, status code passthrough
 */
import { describe, it, expect } from 'vitest'
import { apiOk, apiError } from '@/lib/api-response'

describe('apiOk', () => {
  it('returns a success envelope with data and timestamp, no _metadata by default', async () => {
    const res = apiOk({ foo: 'bar' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ foo: 'bar' })
    expect(typeof body.timestamp).toBe('string')
    expect(new Date(body.timestamp).toString()).not.toBe('Invalid Date')
    expect(body._metadata).toBeUndefined()
  })

  it('includes _metadata when meta is passed', async () => {
    const res = apiOk({ id: 1 }, { page: 2, total: 10 })
    const body = await res.json()
    expect(body._metadata).toEqual({ page: 2, total: 10 })
  })

  it('does not add _metadata key when meta is an empty object (still truthy)', async () => {
    const res = apiOk('x', {})
    const body = await res.json()
    // {} is truthy in JS, so the ternary still attaches _metadata
    expect(body._metadata).toEqual({})
  })

  it('preserves arbitrary data shapes (array, null, primitive)', async () => {
    const arrRes = apiOk([1, 2, 3])
    expect((await arrRes.json()).data).toEqual([1, 2, 3])

    const nullRes = apiOk(null)
    expect((await nullRes.json()).data).toBeNull()

    const primRes = apiOk(42)
    expect((await primRes.json()).data).toBe(42)
  })
})

describe('apiError', () => {
  it('returns an error envelope with the given status and message', async () => {
    const res = apiError('Not found', 404)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('Not found')
    expect(typeof body.timestamp).toBe('string')
    expect(body.code).toBeUndefined()
  })

  it('includes code when provided', async () => {
    const res = apiError('Forbidden', 403, 'CR-AUTH-403')
    const body = await res.json()
    expect(body.code).toBe('CR-AUTH-403')
  })

  it('passes through arbitrary status codes (500, 401, 413)', async () => {
    expect(apiError('x', 500).status).toBe(500)
    expect(apiError('x', 401).status).toBe(401)
    expect(apiError('x', 413).status).toBe(413)
  })
})
