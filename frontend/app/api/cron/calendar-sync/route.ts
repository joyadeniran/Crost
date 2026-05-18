// POST /api/cron/calendar-sync
//
// Daily cron that syncs upcoming Google Calendar events into company_calendar_events
// for every user who has the googlecalendar connection active.
//
// Flow:
//   1. Find all users with an active googlecalendar connection (connections table)
//   2. For each user, call googlecalendar_list_events via Composio (next 30 days)
//   3. Upsert into company_calendar_events (conflict on external_id+user_id → update)
//   4. Return per-user stats

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { runComposioTool } from '@/lib/tools/providers/composio'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Infer event type from Google Calendar event data
function inferEventType(event: any): string {
  const title = (event.summary ?? '').toLowerCase()
  if (title.includes('investor') || title.includes('vc') || title.includes('fundrais') || title.includes('pitch')) {
    return 'investor_meeting'
  }
  if (title.includes('board')) return 'board_meeting'
  if (title.includes('customer') || title.includes('client') || title.includes('account review') || title.includes('qbr')) {
    return 'customer_call'
  }
  if (title.includes('conference') || title.includes('summit') || title.includes('meetup')) {
    return 'conference'
  }
  if (title.includes('deadline') || title.includes('due') || title.includes('launch')) {
    return 'deadline'
  }
  return 'other'
}

function parseGoogleEvent(raw: any): {
  title: string
  date: string
  duration_minutes?: number
  attendees: string[]
  type: string
  external_id: string
} | null {
  const start = raw.start?.dateTime ?? raw.start?.date
  if (!start || !raw.id) return null
  const title = raw.summary ?? '(No title)'
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const attendees: string[] = (raw.attendees ?? [])
    .map((a: any) => (typeof a.email === 'string' ? a.email.trim() : ''))
    .filter((e: string) => EMAIL_RE.test(e))

  let duration_minutes: number | undefined
  if (raw.start?.dateTime && raw.end?.dateTime) {
    const ms = new Date(raw.end.dateTime).getTime() - new Date(raw.start.dateTime).getTime()
    if (ms > 0) duration_minutes = Math.round(ms / 60_000)
  }

  return {
    title,
    date: new Date(start).toISOString(),
    duration_minutes,
    attendees,
    type: inferEventType(raw),
    external_id: raw.id,
  }
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (req.headers.get('x-cron-secret') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  // Find all users with an active googlecalendar connection
  const { data: connectionRows, error: connErr } = await supabase
    .from('connections')
    .select('created_by')
    .eq('service_name', 'googlecalendar')

  if (connErr) {
    console.error('[cron/calendar-sync] Failed to fetch connections:', connErr)
    return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 })
  }

  const userIds = [...new Set((connectionRows ?? []).map((r: { created_by: string }) => r.created_by))]

  if (userIds.length === 0) {
    return NextResponse.json({ success: true, usersProcessed: 0, timestamp: new Date().toISOString() })
  }

  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 30 * 86_400_000).toISOString()

  const results: Array<{
    userId: string
    synced: number
    skipped: number
    error?: string
  }> = []

  for (const userId of userIds) {
    try {
      const toolResult = await runComposioTool({
        userId,
        service: 'GOOGLECALENDAR',
        action: 'LIST_EVENTS',
        params: { timeMin, timeMax, maxResults: 50, singleEvents: true, orderBy: 'startTime' },
      })

      if (!toolResult.success) {
        results.push({ userId, synced: 0, skipped: 0, error: 'Composio call failed' })
        continue
      }

      const rawData = toolResult.data
      const rawEvents: any[] = Array.isArray(rawData?.items)
        ? rawData.items
        : Array.isArray(rawData?.events)
          ? rawData.events
          : Array.isArray(rawData)
            ? rawData
            : []
      let synced = 0
      let skipped = 0

      for (const raw of rawEvents) {
        const parsed = parseGoogleEvent(raw)
        if (!parsed) { skipped++; continue }

        const { error: upsertErr } = await supabase
          .from('company_calendar_events')
          .upsert(
            {
              user_id: userId,
              source: 'google_calendar',
              ...parsed,
            },
            { onConflict: 'user_id,external_id' },
          )

        if (upsertErr) {
          console.error(`[cron/calendar-sync] Upsert failed for event ${parsed.external_id}:`, upsertErr)
          skipped++
        } else {
          synced++
        }
      }

      results.push({ userId, synced, skipped })
    } catch (err: any) {
      console.error(`[cron/calendar-sync] Failed for user ${userId}:`, err)
      // Omit raw error message from response to avoid leaking internal details
      results.push({ userId, synced: 0, skipped: 0, error: 'sync_failed' })
    }
  }

  return NextResponse.json({
    success: true,
    usersProcessed: userIds.length,
    results,
    timestamp: new Date().toISOString(),
  })
}
