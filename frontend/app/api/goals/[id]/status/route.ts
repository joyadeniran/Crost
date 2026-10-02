// GET /api/goals/[id]/status — tiny version probe for the War Room poller.
// Returns only status + a version string (goal.updated_at | task count | newest task update), a few
// hundred bytes instead of the full goal + tasks body. The client refetches the full goal only when
// `version` changes. Shed first by the egress guard.
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { getPool } from '@/lib/db'
import { guardRead } from '@/lib/egress-guard'
import { withEgressLabel, recordEgress, approxBytes } from '@/lib/egress'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  const shed = await guardRead('poll')
  if (shed) return shed
  if (!UUID_RE.test(params.id)) return notFound()

  return withEgressLabel('goal-status', async () => {
    try {
      const { rows } = await getPool().query(
        `SELECT g.status,
                g.updated_at AS goal_updated,
                (SELECT count(*)::int FROM goal_tasks t WHERE t.goal_id = g.id) AS task_count,
                (SELECT max(t.updated_at) FROM goal_tasks t WHERE t.goal_id = g.id) AS task_updated
           FROM goals g
          WHERE g.id = $1 AND g.created_by = $2
          LIMIT 1`,
        [params.id, guard.userId]
      )
      const r = rows[0]
      if (!r) return notFound()
      // Compact progress for the chat's mission card (labels are short; bodies never included).
      const [tasks, extra] = await Promise.all([
        getPool().query(
          `SELECT task_id, label, dept_slug, status FROM goal_tasks WHERE goal_id = $1 ORDER BY created_at LIMIT 20`,
          [params.id]
        ),
        getPool().query(
          `SELECT (SELECT count(*)::int FROM approval_queue WHERE goal_id = $1 AND status = 'pending') AS approvals,
                  (SELECT count(*)::int FROM artifacts WHERE goal_id = $1 AND status <> 'discarded') AS artifacts`,
          [params.id]
        ),
      ])
      const body = {
        success: true,
        data: {
          status: r.status as string,
          version: `${new Date(r.goal_updated).getTime()}|${r.task_count}|${r.task_updated ? new Date(r.task_updated).getTime() : 0}`,
          tasks: tasks.rows,
          approvals_pending: extra.rows[0]?.approvals ?? 0,
          artifacts: extra.rows[0]?.artifacts ?? 0,
        },
      }
      recordEgress({ label: 'goal-status', table: 'goals', op: 'select', bytes: approxBytes(rows), rows: 1, ms: 0 })
      return NextResponse.json(body)
    } catch (err) {
      console.error('[GET /api/goals/[id]/status]', err)
      return NextResponse.json({ success: false, error: 'Failed to fetch status' }, { status: 500 })
    }
  })
}

function notFound() {
  return NextResponse.json({ success: false, error: 'Goal not found', code: 'NOT_FOUND' }, { status: 404 })
}
