import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

type SupabaseClientLike = {
  from: (table: string) => any
}

type IdempotencyStart =
  | { kind: 'none' }
  | { kind: 'started'; key: string }
  | { kind: 'response'; response: NextResponse }

const IDEMPOTENCY_WINDOW_MS = 60 * 60 * 1000
const MAX_IDEMPOTENCY_KEY_LENGTH = 255

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function requestHash(body: unknown) {
  return createHash('sha256').update(stableStringify(body)).digest('hex')
}

function endpointFor(req: NextRequest) {
  return req.nextUrl?.pathname ?? new URL(req.url).pathname
}

export async function beginIdempotentRequest(
  req: NextRequest,
  supabase: SupabaseClientLike,
  userId: string,
  body: unknown,
): Promise<IdempotencyStart> {
  const key = req.headers.get('idempotency-key') ?? req.headers.get('x-idempotency-key')
  if (!key) return { kind: 'none' }

  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { success: false, error: 'Idempotency key is too long' },
        { status: 400 },
      ),
    }
  }

  const endpoint = endpointFor(req)
  const method = req.method.toUpperCase()
  const hash = requestHash(body)

  const { error: insertError } = await supabase.from('idempotency_log').insert({
    idempotency_key: key,
    endpoint,
    method,
    user_id: userId,
    request_hash: hash,
  })

  if (!insertError) return { kind: 'started', key }

  const since = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString()
  const { data: existing, error: selectError } = await supabase
    .from('idempotency_log')
    .select('request_hash, response, status_code, created_at')
    .eq('idempotency_key', key)
    .eq('endpoint', endpoint)
    .eq('method', method)
    .eq('user_id', userId)
    .gte('created_at', since)
    .maybeSingle()

  if (selectError || !existing) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { success: false, error: 'Unable to validate idempotency key' },
        { status: 500 },
      ),
    }
  }

  if (existing.request_hash !== hash) {
    return {
      kind: 'response',
      response: NextResponse.json(
        { success: false, error: 'Idempotency key was already used with a different request body' },
        { status: 409 },
      ),
    }
  }

  if (existing.response) {
    return {
      kind: 'response',
      response: NextResponse.json(existing.response, {
        status: existing.status_code ?? 200,
        headers: { 'x-crost-idempotent-replay': 'true' },
      }),
    }
  }

  return {
    kind: 'response',
    response: NextResponse.json(
      { success: false, error: 'Request with this idempotency key is already in progress' },
      { status: 409 },
    ),
  }
}

export async function completeIdempotentRequest(
  req: NextRequest,
  supabase: SupabaseClientLike,
  userId: string,
  responseBody: unknown,
  statusCode: number,
) {
  const key = req.headers.get('idempotency-key') ?? req.headers.get('x-idempotency-key')
  if (!key) return

  await supabase
    .from('idempotency_log')
    .update({ response: responseBody, status_code: statusCode })
    .eq('idempotency_key', key)
    .eq('endpoint', endpointFor(req))
    .eq('method', req.method.toUpperCase())
    .eq('user_id', userId)
}
