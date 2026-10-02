export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { EventLogClient } from '@/components/event-log/EventLogClient'
import type { EventLogEntry } from '@/types'

interface PageProps {
  searchParams: { goal_id?: string; type?: string }
}

export default async function EventLogPage({ searchParams }: PageProps) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const goalId = searchParams.goal_id ?? null
  const typeFilter = searchParams.type ?? null

  const supabase = createServerSupabaseClient()
  let query = supabase
    .from('event_log')
    .select('*')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  // When arriving from a deep-link (e.g. WarRoom ‘view full event log →’),
  // scope the initial server fetch to that goal so the page loads relevant
  // events immediately. The client can widen the filter from there.
  if (goalId) query = query.eq('goal_id', goalId)

  const { data } = await query
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

      <EventLogClient
        events={events}
        initialGoalId={goalId}
        initialType={typeFilter}
      />
    </div>
  )
}
