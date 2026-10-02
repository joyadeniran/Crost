// POST /api/chats/[id]/run — the founder approves the plan Orc proposed in a message.
// Body: { message_id }. Idempotent: a message starts at most one mission (atomic claim).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { getPool } from '@/lib/db'
import { getOwnedChat } from '@/lib/chat/store'
import { startMission } from '@/lib/chat/mission'
import { validatePlan } from '@/lib/chat/orc'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Params = { params: { id: string } }
const Body = z.object({ message_id: z.string().uuid() })
const notFound = () => NextResponse.json({ success: false, error: 'Plan not found', code: 'NOT_FOUND' }, { status: 404 })

export async function POST(req: NextRequest, { params }: Params) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  const userId = guard.userId

  let messageId: string
  try {
    messageId = Body.parse(await req.json()).message_id
  } catch {
    return NextResponse.json({ success: false, error: 'message_id is required', code: 'VALIDATION_ERROR' }, { status: 400 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(params.id) || !(await getOwnedChat(params.id, userId))) return notFound()

  const pool = getPool()
  // Claim: only one request may start this message's mission.
  const claim = await pool.query(
    `UPDATE chat_messages SET meta = meta || '{"starting": true}'::jsonb
      WHERE id = $1 AND chat_id = $2 AND created_by = $3 AND role = 'assistant'
        AND meta ? 'plan' AND NOT (meta ? 'goal_id') AND NOT (meta ? 'starting')
      RETURNING meta`,
    [messageId, params.id, userId]
  )
  if (claim.rowCount === 0) {
    const { rows } = await pool.query(
      `SELECT meta FROM chat_messages WHERE id = $1 AND chat_id = $2 AND created_by = $3`,
      [messageId, params.id, userId]
    )
    const meta = rows[0]?.meta
    if (!meta?.plan) return notFound()
    if (meta.goal_id) return NextResponse.json({ success: true, data: { goal_id: meta.goal_id, already: true } })
    return NextResponse.json({ success: false, error: 'This plan is already starting.', code: 'CONFLICT' }, { status: 409 })
  }

  const plan = validatePlan(JSON.stringify(claim.rows[0].meta.plan))
  if (!plan) {
    await pool.query(`UPDATE chat_messages SET meta = meta - 'starting' WHERE id = $1`, [messageId])
    return notFound()
  }

  try {
    const { rows } = await pool.query(
      `SELECT content FROM chat_messages WHERE chat_id = $1 AND created_by = $2 AND role = 'user'
        AND created_at <= (SELECT created_at FROM chat_messages WHERE id = $3)
        ORDER BY created_at DESC LIMIT 1`,
      [params.id, userId, messageId]
    )
    const goalId = await startMission({ userId, plan, founderInput: rows[0]?.content ?? plan.title })
    await pool.query(
      `UPDATE chat_messages SET meta = (meta - 'starting') || jsonb_build_object('goal_id', $2::text) WHERE id = $1`,
      [messageId, goalId]
    )
    return NextResponse.json({ success: true, data: { goal_id: goalId } })
  } catch (err) {
    console.error('[POST /api/chats/[id]/run]', err)
    await pool.query(`UPDATE chat_messages SET meta = meta - 'starting' WHERE id = $1`, [messageId])
    return NextResponse.json({ success: false, error: 'Could not start the mission. Try again.' }, { status: 500 })
  }
}
