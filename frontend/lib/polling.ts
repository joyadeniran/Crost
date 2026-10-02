// lib/polling.ts — client-side poller that cannot become an egress leak.
// - pauses while the tab is hidden, resumes on focus
// - exponential backoff while nothing changes (base → max)
// - honors Retry-After / 429 EGRESS_BUDGET by stopping until the server says to retry
// - hard max duration
// Pure scheduling helpers are exported for unit tests.

export interface PollOptions {
  baseMs?: number
  maxMs?: number
  maxDurationMs?: number
}

export const POLL_DEFAULTS = { baseMs: 4000, maxMs: 30000, maxDurationMs: 30 * 60 * 1000 }

/** Delay before the next poll: grows 1.5x per unchanged tick, resets to base on change. */
export function nextDelay(current: number, changed: boolean, opts: PollOptions = {}): number {
  const base = opts.baseMs ?? POLL_DEFAULTS.baseMs
  const max = opts.maxMs ?? POLL_DEFAULTS.maxMs
  if (changed) return base
  return Math.min(max, Math.round(current * 1.5))
}

/** Parse Retry-After seconds into ms (clamped 1s..1h); null if absent/invalid. */
export function retryAfterMs(header: string | null | undefined): number | null {
  if (!header) return null
  const s = Number(header)
  if (!Number.isFinite(s) || s <= 0) return null
  return Math.min(3600, Math.max(1, s)) * 1000
}

export type PollResult = 'changed' | 'unchanged' | 'stop' | { retryAfterMs: number }

/**
 * Starts polling `tick` and returns a stop function. `tick` returns whether anything changed,
 * 'stop' to end, or { retryAfterMs } to back off for a server-specified time.
 */
export function startPolling(tick: () => Promise<PollResult>, opts: PollOptions = {}): () => void {
  const base = opts.baseMs ?? POLL_DEFAULTS.baseMs
  const maxDuration = opts.maxDurationMs ?? POLL_DEFAULTS.maxDurationMs
  const startedAt = Date.now()
  let delay = base
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

  const schedule = (ms: number) => {
    if (stopped) return
    timer = setTimeout(run, ms)
  }

  async function run() {
    timer = null
    if (stopped) return
    if (Date.now() - startedAt > maxDuration) return
    if (hidden()) return // resumed by the visibility listener
    let result: PollResult
    try { result = await tick() } catch { result = 'unchanged' }
    if (stopped || result === 'stop') return
    if (typeof result === 'object') { schedule(result.retryAfterMs); return }
    delay = nextDelay(delay, result === 'changed', opts)
    schedule(delay)
  }

  const onVisible = () => {
    if (stopped || hidden() || timer) return
    delay = base
    schedule(0)
  }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  schedule(base)

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
  }
}
