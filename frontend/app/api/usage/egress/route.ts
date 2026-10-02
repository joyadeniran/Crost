// GET /api/usage/egress — the signed-in founder can see today's data-transfer budget and the top
// routes by bytes (from the egress ledger). Read-only, one tiny aggregate query.
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { getPool } from '@/lib/db'
import { refreshBudget } from '@/lib/egress-ledger'
import { egressSnapshot, todayUtc } from '@/lib/egress'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  try {
    const pool = getPool()
    const state = await refreshBudget(pool)
    const { rows } = await pool.query(
      `SELECT label, bytes::bigint AS bytes, calls::bigint AS calls FROM egress_ledger WHERE day = $1 ORDER BY bytes DESC LIMIT 15`,
      [todayUtc()]
    )
    return NextResponse.json({
      success: true,
      data: {
        level: state.level,
        day: state.day,
        used_bytes: state.usedBytes,
        budget_bytes: state.budgetBytes,
        fraction: state.fraction,
        top: rows.map((r: { label: string; bytes: string; calls: string }) => ({ label: r.label, bytes: Number(r.bytes), calls: Number(r.calls) })),
        this_instance: egressSnapshot(),
      },
    })
  } catch (err) {
    console.error('[GET /api/usage/egress]', err)
    return NextResponse.json({ success: false, error: 'Failed to read egress usage' }, { status: 500 })
  }
}
