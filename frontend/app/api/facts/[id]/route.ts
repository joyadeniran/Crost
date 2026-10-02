// DELETE /api/facts/[id] — retire one of the founder's facts (kept as history, no longer used).
import { NextRequest } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { apiError, apiOk } from '@/lib/api-response'
import { removeFact } from '@/lib/facts/store'

export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  if (!UUID_RE.test(params.id) || !(await removeFact(guard.userId, params.id))) {
    return apiError('Fact not found', 404, 'NOT_FOUND')
  }
  return apiOk({ removed: true })
}
