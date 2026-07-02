// GET  /api/recurring-missions — list all recurring missions for the authenticated user
// POST /api/recurring-missions — create a new recurring mission

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerComponentClient } from '@/lib/supabase'
import { createRecurringMission, listRecurringMissions } from '@/lib/recurring-missions'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const CreateSchema = z.object({
  title: z.string().min(3).max(200),
  founder_input: z.string().min(5).max(2000),
  cadence: z.enum(['daily', 'weekly', 'monthly']),
  cadence_day: z.number().int().min(0).max(31).nullable().optional(),
  auto_dispatch: z.boolean().optional(),
  risk_tier_limit: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  source_goal_id: z.string().uuid().nullable().optional(),
})

export async function GET(_req: NextRequest) {
  try {
    const guardResult = await requireUser(_req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const missions = await listRecurringMissions(user.id)
    return NextResponse.json({ success: true, data: missions, timestamp: new Date().toISOString() })
  } catch (err: any) {
    console.error('[GET /api/recurring-missions]', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Failed to fetch missions', timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const body = await req.json()
    const input = CreateSchema.parse(body)

    const mission = await createRecurringMission(user.id, input)
    return NextResponse.json({ success: true, data: mission, timestamp: new Date().toISOString() }, { status: 201 })
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() },
        { status: 400 },
      )
    }
    console.error('[POST /api/recurring-missions]', err)
    return NextResponse.json(
      { success: false, error: err?.message ?? 'Failed to create mission', timestamp: new Date().toISOString() },
      { status: 500 },
    )
  }
}
