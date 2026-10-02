// lib/egress.ts
// Egress accounting for the pg shim (lib/db.ts). Pure in-memory — no DB access, so
// it can be imported from anywhere without cycles. Persistence lives in
// lib/egress-ledger.ts.
//
// Why this exists: Supabase bills *data leaving the database*, shared across every
// project in the org (free plan: 5 GB uncached / 5 GB cached per month). The previous
// incarnation of Crost repeatedly blew that quota because nothing measured or capped
// what each query/route/poll returned. Every read and write that goes through the shim
// is now attributed to a label (route / job), counted, and checked against hard limits.
//
// Server-side ONLY.

import { AsyncLocalStorage } from 'node:async_hooks'

export interface EgressLimits {
  /** Log a warning when a single query returns more than this. */
  warnQueryBytes: number
  /** Throw when a single READ returns more than this (emergency brake). */
  maxQueryBytes: number
  /** Row cap applied to every SELECT that has no explicit .limit(). */
  defaultRowLimit: number
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  const n = raw === undefined || raw === '' ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

export function getEgressLimits(): EgressLimits {
  return {
    warnQueryBytes: intEnv('EGRESS_WARN_QUERY_BYTES', 64 * 1024),
    maxQueryBytes: intEnv('EGRESS_MAX_QUERY_BYTES', 5 * 1024 * 1024),
    defaultRowLimit: intEnv('EGRESS_DEFAULT_ROW_LIMIT', 500),
  }
}

export class EgressLimitError extends Error {
  readonly code = 'EGRESS_LIMIT'
  constructor(readonly table: string, readonly bytes: number, readonly maxBytes: number, readonly label: string) {
    super(`Query on "${table}" returned ${bytes} bytes (limit ${maxBytes}) in "${label}" — select fewer columns/rows.`)
    this.name = 'EgressLimitError'
  }
}

// ── Labels ────────────────────────────────────────────────────────────────
const labelStore = new AsyncLocalStorage<{ label: string }>()

/** Attribute everything inside `fn` to `label` (e.g. 'GET /api/goals/[id]'). */
export function withEgressLabel<T>(label: string, fn: () => T): T {
  return labelStore.run({ label }, fn)
}

export function currentEgressLabel(): string {
  return labelStore.getStore()?.label ?? 'unlabeled'
}

// ── Measuring ─────────────────────────────────────────────────────────────
/** Approximate wire size of a result set (JSON bytes — what PostgREST/pg would ship). */
export function approxBytes(rows: unknown): number {
  if (rows === null || rows === undefined) return 0
  try {
    return Buffer.byteLength(JSON.stringify(rows), 'utf8')
  } catch {
    return 0
  }
}

// ── Counters ──────────────────────────────────────────────────────────────
export interface EgressEntry {
  label: string
  table: string
  op: 'select' | 'write' | 'rpc'
  bytes: number
  rows: number
  ms: number
}

interface Bucket { bytes: number; calls: number }

const pending = new Map<string, Bucket>() // key = `${day}\u0000${label}` — not yet flushed to the ledger
const totals = new Map<string, Bucket>() // same key — everything this instance has seen today
let biggest: Array<{ label: string; table: string; bytes: number; rows: number; at: string }> = []

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function bump(map: Map<string, Bucket>, key: string, bytes: number) {
  const b = map.get(key) ?? { bytes: 0, calls: 0 }
  b.bytes += bytes
  b.calls += 1
  map.set(key, b)
}

export function recordEgress(entry: EgressEntry, now: Date = new Date()): void {
  const { warnQueryBytes } = getEgressLimits()
  const key = `${todayUtc(now)}\u0000${entry.label}`
  bump(pending, key, entry.bytes)
  bump(totals, key, entry.bytes)

  if (entry.bytes >= warnQueryBytes) {
    // Structured line so it can be grepped / drained from Vercel logs.
    console.warn(
      `[egress] ${JSON.stringify({ level: 'large_query', label: entry.label, table: entry.table, op: entry.op, bytes: entry.bytes, rows: entry.rows, ms: entry.ms })}`
    )
    biggest.push({ label: entry.label, table: entry.table, bytes: entry.bytes, rows: entry.rows, at: now.toISOString() })
    biggest.sort((a, b) => b.bytes - a.bytes)
    biggest = biggest.slice(0, 10)
  }
}

export interface DrainedRow { day: string; label: string; bytes: number; calls: number }

/** Take (and clear) everything not yet persisted. */
export function drainPending(): DrainedRow[] {
  const rows: DrainedRow[] = []
  for (const [key, b] of pending) {
    const [day, label] = key.split('\u0000')
    rows.push({ day, label, bytes: b.bytes, calls: b.calls })
  }
  pending.clear()
  return rows
}

/** Put rows back after a failed flush so the bytes are not lost. */
export function restorePending(rows: DrainedRow[]): void {
  for (const r of rows) {
    const key = `${r.day}\u0000${r.label}`
    const b = pending.get(key) ?? { bytes: 0, calls: 0 }
    b.bytes += r.bytes
    b.calls += r.calls
    pending.set(key, b)
  }
}

export function pendingBytesToday(now: Date = new Date()): number {
  const day = todayUtc(now)
  let sum = 0
  for (const [key, b] of pending) if (key.startsWith(`${day}\u0000`)) sum += b.bytes
  return sum
}

export interface EgressSnapshot {
  day: string
  totalBytes: number
  totalCalls: number
  byLabel: Array<{ label: string; bytes: number; calls: number }>
  biggestQueries: typeof biggest
}

/** This instance's view of today (the ledger holds the cross-instance truth). */
export function egressSnapshot(now: Date = new Date()): EgressSnapshot {
  const day = todayUtc(now)
  const byLabel: EgressSnapshot['byLabel'] = []
  let totalBytes = 0
  let totalCalls = 0
  for (const [key, b] of totals) {
    const [d, label] = key.split('\u0000')
    if (d !== day) continue
    byLabel.push({ label, bytes: b.bytes, calls: b.calls })
    totalBytes += b.bytes
    totalCalls += b.calls
  }
  byLabel.sort((a, b) => b.bytes - a.bytes)
  return { day, totalBytes, totalCalls, byLabel, biggestQueries: biggest }
}

/** Test helper. */
export function resetEgressForTests(): void {
  pending.clear()
  totals.clear()
  biggest = []
}
