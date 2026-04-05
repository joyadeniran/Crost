export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { EventLogClient } from '@/components/event-log/EventLogClient'
import type { EventLogEntry } from '@/types'

export default async function EventLogPage() {
  const supabase = createServerSupabaseClient()

  const { data } = await supabase
    .from('event_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  const events = (data ?? []) as EventLogEntry[]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 2 }}>
          Event Log
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Full activity history — last 200 events
        </p>
      </div>

      <EventLogClient events={events} />
    </div>
  )
}
