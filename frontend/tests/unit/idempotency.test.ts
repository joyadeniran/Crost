/**
 * Unit tests: lib/idempotency.ts
 *
 * Covers: no key present -> 'none'; first use inserts and returns 'started';
 * duplicate key + same body -> cached replay; duplicate key + different body
 * -> 409; in-flight duplicate (no response yet) -> 409; key too long -> 400;
 * select error -> 500; completeIdempotentRequest updates the row.
 */
import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'

function makeRequest(headers: Record<string, string> = {}, method = 'POST') {
  return new NextRequest('http://localhost/api/goals', {
    method,
    headers,
  })
}

/** Minimal chainable Supabase-like query builder mock. */
function makeSupabaseMock({
  insertError = null as any,
  selectResult = { data: null, error: null } as any,
} = {}) {
  const calls: Record<string, any[]> = { insert: [], update: [], eq: [] }
  const builder: any = {
    insert: vi.fn((row: any) => {
      calls.insert.push(row)
      return Promise.resolve({ error: insertError })
    }),
    select: vi.fn(() => builder),
    eq: vi.fn((...args: any[]) => {
      calls.eq.push(args)
      return builder
    }),
    gte: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(selectResult)),
    update: vi.fn((row: any) => {
      calls.update.push(row)
      return builder
    }),
  }
  return { from: vi.fn(() => builder), calls, builder }
}

describe('beginIdempotentRequest', () => {
  it('returns kind "none" when no Idempotency-Key header is present', async () => {
    const req = makeRequest()
    const supabase = makeSupabaseMock()
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', { a: 1 })
    expect(result.kind).toBe('none')
  })

  it('accepts the lowercase x-idempotency-key header as fallback', async () => {
    const req = makeRequest({ 'x-idempotency-key': 'key-abc' })
    const supabase = makeSupabaseMock()
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', { a: 1 })
    expect(result.kind).toBe('started')
  })

  it('rejects keys longer than 255 chars with 400', async () => {
    const req = makeRequest({ 'idempotency-key': 'x'.repeat(300) })
    const supabase = makeSupabaseMock()
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', {})
    expect(result.kind).toBe('response')
    if (result.kind === 'response') {
      expect(result.response.status).toBe(400)
    }
  })

  it('first use: insert succeeds -> kind "started"', async () => {
    const req = makeRequest({ 'idempotency-key': 'key-1' })
    const supabase = makeSupabaseMock({ insertError: null })
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', { a: 1 })
    expect(result.kind).toBe('started')
    if (result.kind === 'started') expect(result.key).toBe('key-1')
  })

  it('duplicate key with identical body and a cached response -> replays cached response', async () => {
    const req = makeRequest({ 'idempotency-key': 'key-2' })
    const cachedBody = { success: true, data: { id: 42 } }
    const supabase = makeSupabaseMock({
      insertError: { message: 'duplicate key value violates unique constraint' },
      selectResult: {
        data: {
          request_hash: undefined, // filled below to match actual hash
          response: cachedBody,
          status_code: 201,
          created_at: new Date().toISOString(),
        },
        error: null,
      },
    })
    // Compute the hash the same way the module does isn't exposed; instead
    // reuse the same body so the module recomputes an identical hash and we
    // patch selectResult.data.request_hash after import via a second call path.
    // Simplify: since request_hash must match exactly, call once to observe.
    const body = { a: 1 }
    // Monkey-patch maybeSingle to reflect matching hash: we can't easily compute
    // sha256 here without importing crypto ourselves, so just import 'crypto'.
    const { createHash } = await import('node:crypto')
    const stable = JSON.stringify(body)
    const hash = createHash('sha256').update(stable).digest('hex')
    supabase.builder.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { request_hash: hash, response: cachedBody, status_code: 201, created_at: new Date().toISOString() },
        error: null,
      }),
    )

    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', body)
    expect(result.kind).toBe('response')
    if (result.kind === 'response') {
      expect(result.response.status).toBe(201)
      expect(result.response.headers.get('x-crost-idempotent-replay')).toBe('true')
      const json = await result.response.json()
      expect(json).toEqual(cachedBody)
    }
  })

  it('duplicate key with a different body -> 409 conflict', async () => {
    const req = makeRequest({ 'idempotency-key': 'key-3' })
    const supabase = makeSupabaseMock({
      insertError: { message: 'duplicate key value violates unique constraint' },
      selectResult: {
        data: { request_hash: 'totally-different-hash', response: null, status_code: null, created_at: new Date().toISOString() },
        error: null,
      },
    })
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', { a: 1 })
    expect(result.kind).toBe('response')
    if (result.kind === 'response') {
      expect(result.response.status).toBe(409)
    }
  })

  it('duplicate key, same body, still in-flight (no cached response yet) -> 409', async () => {
    const req = makeRequest({ 'idempotency-key': 'key-4' })
    const body = { a: 1 }
    const { createHash } = await import('node:crypto')
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex')
    const supabase = makeSupabaseMock({
      insertError: { message: 'duplicate key value violates unique constraint' },
      selectResult: {
        data: { request_hash: hash, response: null, status_code: null, created_at: new Date().toISOString() },
        error: null,
      },
    })
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', body)
    expect(result.kind).toBe('response')
    if (result.kind === 'response') {
      expect(result.response.status).toBe(409)
    }
  })

  it('insert fails and the follow-up select also fails -> 500', async () => {
    const req = makeRequest({ 'idempotency-key': 'key-5' })
    const supabase = makeSupabaseMock({
      insertError: { message: 'duplicate key' },
      selectResult: { data: null, error: { message: 'select failed' } },
    })
    const result = await beginIdempotentRequest(req, supabase as any, 'user-1', {})
    expect(result.kind).toBe('response')
    if (result.kind === 'response') {
      expect(result.response.status).toBe(500)
    }
  })
})

describe('completeIdempotentRequest', () => {
  it('no-ops when there is no idempotency key header', async () => {
    const req = makeRequest()
    const supabase = makeSupabaseMock()
    await completeIdempotentRequest(req, supabase as any, 'user-1', { ok: true }, 200)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('updates the idempotency_log row with response and status_code when a key is present', async () => {
    const req = makeRequest({ 'idempotency-key': 'key-6' })
    const supabase = makeSupabaseMock()
    await completeIdempotentRequest(req, supabase as any, 'user-1', { ok: true }, 201)
    expect(supabase.from).toHaveBeenCalledWith('idempotency_log')
    expect(supabase.calls.update[0]).toEqual({ response: { ok: true }, status_code: 201 })
  })
})
