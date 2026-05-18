import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

const UpdateEventSchema = z.object({
  type: z.enum(['investor_meeting', 'customer_call', 'board_meeting', 'conference', 'deadline', 'other']).optional(),
  title: z.string().min(1).max(500).optional(),
  date: z.string().datetime().optional(),
  duration_minutes: z.number().int().positive().nullable().optional(),
  attendees: z.array(z.string()).optional(),
  prep_required: z.array(z.string()).optional(),
  related_goals: z.array(z.string().uuid()).optional(),
  meeting_notes: z.string().nullable().optional(),
  outcomes: z.string().nullable().optional(),
  next_actions: z.array(z.string()).optional(),
}).refine(data => Object.keys(data).length > 0, { message: 'At least one field required' })

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const body = await req.json()
    const parsed = UpdateEventSchema.parse(body)
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('company_calendar_events')
      .update(parsed)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'Event not found or access denied', code: 'NOT_FOUND', timestamp: new Date().toISOString() }, { status: 404 })
    }

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() }, { status: 400 })
    }
    console.error('[PATCH /api/calendar-events/[id]]', err)
    return NextResponse.json({ success: false, error: 'Internal error', timestamp: new Date().toISOString() }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const supabase = createServerSupabaseClient()
    const { error } = await supabase
      .from('company_calendar_events')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ success: false, error: 'Event not found or access denied', code: 'NOT_FOUND', timestamp: new Date().toISOString() }, { status: 404 })
    }

    return NextResponse.json({ success: true, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[DELETE /api/calendar-events/[id]]', err)
    return NextResponse.json({ success: false, error: 'Internal error', timestamp: new Date().toISOString() }, { status: 500 })
  }
}
