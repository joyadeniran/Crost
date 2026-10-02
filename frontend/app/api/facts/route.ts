// GET /api/facts — the founder's live company facts.
// POST /api/facts — save facts the founder confirmed. Body: { facts: [...], chat_id?, message_id? }.
//   With a message id the facts come from Orc's proposal in that message; the message is marked
//   saved so the card does not offer them again. Facts are only ever written on the founder's click.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { apiError, apiOk } from '@/lib/api-response'
import { getPool } from '@/lib/db'
import { cleanFact, MAX_PROPOSED, type ProposedFact } from '@/lib/facts/facts'
import { listFacts, saveFacts } from '@/lib/facts/store'

export const dynamic = 'force-dynamic'

const Body = z.object({
  facts: z.array(z.unknown()).min(1).max(MAX_PROPOSED),
  chat_id: z.string().uuid().optional(),
  message_id: z.string().uuid().optional(),
})

export async function GET(req: NextRequest) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  return apiOk({ facts: await listFacts(guard.userId) })
}

export async function POST(req: NextRequest) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  const userId = guard.userId

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return apiError('facts must be a list of 1–10 facts', 400, 'VALIDATION_ERROR')
  }
  const facts = body.facts.map(cleanFact).filter((f): f is ProposedFact => f !== null)
  if (facts.length !== body.facts.length) return apiError('Every fact needs a key and a value.', 400, 'VALIDATION_ERROR')

  const fromChat = Boolean(body.message_id && body.chat_id)
  if (fromChat) {
    // The proposal must be in a message this founder owns.
    const { rowCount } = await getPool().query(
      `SELECT 1 FROM chat_messages WHERE id = $1 AND chat_id = $2 AND created_by = $3 AND meta ? 'facts'`,
      [body.message_id, body.chat_id, userId]
    )
    if (!rowCount) return apiError('Message not found', 404, 'NOT_FOUND')
  }

  try {
    const saved = await saveFacts(userId, facts, fromChat ? 'chat' : 'settings')
    if (fromChat) {
      await getPool().query(
        `UPDATE chat_messages SET meta = meta || '{"facts_saved": true}'::jsonb WHERE id = $1 AND created_by = $2`,
        [body.message_id, userId]
      )
    }
    return apiOk({ facts: saved })
  } catch (err) {
    console.error('[POST /api/facts]', err)
    return apiError('Could not save the facts. Try again.', 500, 'INTERNAL_ERROR')
  }
}
