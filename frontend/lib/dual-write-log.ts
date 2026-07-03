// lib/dual-write-log.ts
// Phase 5 (10x rebuild, spec §8): shared helper for the "DUAL-WRITE" pattern
// used at three call sites (lib/engine/orchestrator.ts, lib/engine/memo.ts,
// lib/tools/execute-tool-call.ts) that write to `company_memo` — the table
// spec §8 declares "the source of truth" — as a fire-and-forget secondary
// write. All three previously used `.catch(() => {})`, silently swallowing
// any failure with zero observability (no log, no metric, no retry). Spec
// line 572 explicitly sanctions the dual-table design and fire-and-forget
// is intentional here (the primary write already succeeded; the founder
// shouldn't wait on a secondary structured-memory write) — this helper does
// not change that control flow, it only makes a real failure visible
// instead of invisible.

import { log } from '@/lib/log'

export function logDualWriteFailure(
  source: string,
  promise: Promise<unknown>,
  context: Record<string, unknown>
): void {
  promise.catch((err) =>
    log.warn(`[${source}] company_memo dual-write failed`, { ...context, error: String(err) })
  )
}
