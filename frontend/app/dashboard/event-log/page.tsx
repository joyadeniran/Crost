export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { EventLogClient } from '@/components/event-log/EventLogClient'
import type { EventLogEntry } from '@/types'

export default async function EventLogPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('event_log')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const events = (data ?? []) as EventLogEntry[]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 2 }}>
          Event Log
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
          Full activity history - actions, tokens, and system updates
        </p>
      </div>

      <EventLogClient events={events} />
    </div>
  )
}
