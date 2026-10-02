// lib/egress-ledger.ts
// Persists the in-memory egress counters (lib/egress.ts) to `egress_ledger` so the
// daily budget is correct across serverless instances. Takes the pool as a
// parameter (no import of lib/db.ts) so the shim can call it without a cycle, and
// its own queries are NOT metered (that would recurse).
//
// Server-side ONLY.

import { drainPending, restorePending, pendingBytesToday, todayUtc, type DrainedRow } from './egress'

interface Queryable { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> } // eslint-disable-line @typescript-eslint/no-explicit-any

const FLUSH_INTERVAL_MS = 20_000
const FLUSH_BYTES_THRESHOLD = 1024 * 1024

let lastFlushAt = 0
let inFlight: Promise<void> | null = null

/** Write all pending counters. Safe to call concurrently and never throws. */
export async function flushEgressLedger(pool: Queryable): Promise<void> {
  if (inFlight) return inFlight
  const rows = drainPending()
  if (rows.length === 0) return
  inFlight = (async () => {
    try {
      const values: string[] = []
      const params: unknown[] = []
      rows.forEach((r: DrainedRow, i) => {
        const o = i * 4
        values.push(`($${o + 1}::date, $${o + 2}, $${o + 3}::bigint, $${o + 4}::bigint)`)
        params.push(r.day, r.label, Math.round(r.bytes), r.calls)
      })
      await pool.query(
        `INSERT INTO egress_ledger (day, label, bytes, calls) VALUES ${values.join(', ')}
         ON CONFLICT (day, label) DO UPDATE
           SET bytes = egress_ledger.bytes + EXCLUDED.bytes,
               calls = egress_ledger.calls + EXCLUDED.calls,
               updated_at = now()`,
        params
      )
      lastFlushAt = Date.now()
    } catch (err) {
      restorePending(rows) // keep the bytes for the next attempt
      lastFlushAt = Date.now() + 5 * 60_000 // back off ~5 min so a missing table does not spam logs
      console.error('[egress-ledger] flush failed (will retry):', (err as Error).message)
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Flush if it has been a while or a lot has accumulated. Returns the flush promise, or null. */
export function maybeFlushEgressLedger(pool: Queryable, now: number = Date.now()): Promise<void> | null {
  if (inFlight) return null
  const due = now - lastFlushAt >= FLUSH_INTERVAL_MS || pendingBytesToday() >= FLUSH_BYTES_THRESHOLD
  return due ? flushEgressLedger(pool) : null
}

// ── Daily budget ──────────────────────────────────────────────────────────
export type BudgetLevel = 'off' | 'ok' | 'warn' | 'shed' | 'block'

export interface BudgetState {
  level: BudgetLevel
  day: string
  usedBytes: number
  budgetBytes: number
  fraction: number
}

export const BUDGET_WARN = 0.7
export const BUDGET_SHED = 0.9
export const BUDGET_BLOCK = 1.0

/** Daily app-side egress budget in bytes. EGRESS_DAILY_BUDGET_MB=0 disables enforcement. */
export function dailyBudgetBytes(): number {
  const raw = process.env.EGRESS_DAILY_BUDGET_MB
  const mb = raw === undefined || raw === '' ? 100 : Number(raw)
  return Number.isFinite(mb) && mb > 0 ? Math.floor(mb * 1024 * 1024) : 0
}

export function levelFor(usedBytes: number, budget: number): BudgetLevel {
  if (budget <= 0) return 'off'
  const f = usedBytes / budget
  if (f >= BUDGET_BLOCK) return 'block'
  if (f >= BUDGET_SHED) return 'shed'
  if (f >= BUDGET_WARN) return 'warn'
  return 'ok'
}

let cache: { day: string; ledgerBytes: number; at: number } | null = null
const CACHE_TTL_MS = 60_000

/** Synchronous view: cached ledger total + whatever this instance has not flushed yet. */
export function currentBudgetState(now: Date = new Date()): BudgetState {
  const day = todayUtc(now)
  const budget = dailyBudgetBytes()
  const ledgerBytes = cache && cache.day === day ? cache.ledgerBytes : 0
  const used = ledgerBytes + pendingBytesToday(now)
  return { level: levelFor(used, budget), day, usedBytes: used, budgetBytes: budget, fraction: budget > 0 ? used / budget : 0 }
}

/** Refresh the cached ledger total (one tiny aggregate query, at most once a minute). */
export async function refreshBudget(pool: Queryable, now: Date = new Date()): Promise<BudgetState> {
  const day = todayUtc(now)
  if (dailyBudgetBytes() > 0 && (!cache || cache.day !== day || now.getTime() - cache.at >= CACHE_TTL_MS)) {
    try {
      const r = await pool.query(`SELECT COALESCE(SUM(bytes), 0)::bigint AS bytes FROM egress_ledger WHERE day = $1::date`, [day])
      cache = { day, ledgerBytes: Number(r.rows[0]?.bytes ?? 0), at: now.getTime() }
    } catch (err) {
      // Fail OPEN: a ledger outage must never take the product down.
      cache = { day, ledgerBytes: cache?.day === day ? cache.ledgerBytes : 0, at: now.getTime() }
      console.error('[egress-ledger] budget refresh failed (failing open):', (err as Error).message)
    }
  }
  return currentBudgetState(now)
}

/** Seconds until 00:00 UTC (when the daily budget resets). */
export function secondsUntilReset(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000))
}

export function resetBudgetCacheForTests(): void {
  cache = null
  lastFlushAt = 0
  inFlight = null
}
