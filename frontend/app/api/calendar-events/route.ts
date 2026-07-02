import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { requireUser } from '@/lib/auth/guard'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const CreateEventSchema = z.object({
  type: z.enum(['investor_meeting', 'customer_call', 'board_meeting', 'conference', 'deadline', 'other']).default('other'),
  title: z.string().min(1).max(500),
  date: z.string().datetime(),
  duration_minutes: z.number().int().positive().optional(),
  attendees: z.array(z.string()).default([]),
  prep_required: z.array(z.string()).default([]),
  related_goals: z.array(z.string().uuid()).default([]),
  meeting_notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const upcoming = searchParams.get('upcoming') === 'true'
    const days = parseInt(searchParams.get('days') ?? '30', 10) || 30

    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('company_calendar_events')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (upcoming) {
      const now = new Date().toISOString()
      const until = new Date(Date.now() + days * 86_400_000).toISOString()
      query = query.gte('date', now).lte('date', until)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to fetch events', timestamp: new Date().toISOString() }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[GET /api/calendar-events]', err)
    return NextResponse.json({ success: false, error: 'Internal error', timestamp: new Date().toISOString() }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const body = await req.json()
    const parsed = CreateEventSchema.parse(body)

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('company_calendar_events')
      .insert({ ...parsed, user_id: user.id, source: 'manual' })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: 'Failed to create event', timestamp: new Date().toISOString() }, { status: 500 })
    }

    return NextResponse.json({ success: true, data, timestamp: new Date().toISOString() }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: err.errors[0].message, code: 'VALIDATION_ERROR', timestamp: new Date().toISOString() }, { status: 400 })
    }
    console.error('[POST /api/calendar-events]', err)
    return NextResponse.json({ success: false, error: 'Internal error', timestamp: new Date().toISOString() }, { status: 500 })
  }
}
