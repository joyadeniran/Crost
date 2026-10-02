// lib/egress-guard.ts
// Route-level egress guard. Reads are classified:
//   'poll'  — cheap status probes the UI repeats; shed first (>=90% of the daily budget)
//   'read'  — ordinary page/API reads; blocked at 100%
//   'write' — never blocked (approvals, goal creation, etc. must always work)
// Responses carry `x-egress-level` and, when shedding, a Retry-After to the next UTC midnight so
// well-behaved clients (lib/polling.ts) stop on their own.
//
// Fails OPEN on any internal error.
//
// Server-side ONLY.

import { NextResponse } from 'next/server'
import { getPool } from './db'
import { refreshBudget, secondsUntilReset, type BudgetLevel } from './egress-ledger'

export type ReadKind = 'poll' | 'read' | 'write'

export function shouldRefuse(level: BudgetLevel, kind: ReadKind): boolean {
  if (kind === 'write' || level === 'off' || level === 'ok' || level === 'warn') return false
  if (level === 'shed') return kind === 'poll'
  return true // block: poll + read
}

/** Returns a response to short-circuit with when the budget says no; null to proceed. */
export async function guardRead(kind: ReadKind): Promise<NextResponse | null> {
  try {
    const state = await refreshBudget(getPool())
    if (!shouldRefuse(state.level, kind)) return null
    const retry = kind === 'poll' ? Math.min(secondsUntilReset(), 900) : secondsUntilReset()
    return NextResponse.json(
      {
        success: false,
        error: 'Daily data budget reached — live updates are paused and resume automatically.',
        code: 'EGRESS_BUDGET',
        level: state.level,
        retry_in_seconds: retry,
      },
      { status: 429, headers: { 'Retry-After': String(retry), 'x-egress-level': state.level } }
    )
  } catch {
    return null
  }
}
