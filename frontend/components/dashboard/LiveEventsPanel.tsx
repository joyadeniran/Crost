'use client'

import { useState, useEffect } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
import type { EventLogEntry } from '@/types'

const EVENT_COLORS: Record<string, string> = {
  task_started:        '#4da6ff',
  task_completed:      '#00d4aa',
  task_failed:         '#ff4d6d',
  approval_requested:  '#ffb347',
  approval_approved:   '#00d4aa',
  approval_rejected:   '#ff4d6d',
  memo_written:        '#a855f7',
  plan_drafted:        '#a855f7', // Orchestrator Violet
  orc_rebalance:       '#fbbf24', // Amber for coordination
  orc_stall_detected:  '#ef4444', // Red for stalls
  mode_switched:       '#64748b',
  department_created:  '#00d4aa',
  department_updated:  '#4da6ff',
  department_deprecated: '#ff4d6d',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface Props {
  initial: EventLogEntry[]
  isHidden?: boolean
}

export function LiveEventsPanel({ initial, isHidden }: Props) {
  const [events, setEvents] = useState<EventLogEntry[]>(initial)
  const [newId, setNewId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const channel = supabaseClient
      .channel('event-log-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'event_log' },
        (payload) => {
          const entry = payload.new as EventLogEntry
          setNewId(entry.id)
          setEvents(prev => [entry, ...prev.slice(0, 19)])
        }
      )
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [])

  return (
    <div className="events-panel" style={isHidden ? { display: 'none' } : undefined}>
      <div className="events-panel-header">
        <span className="events-panel-title">LIVE EVENTS</span>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--accent)',
        }}>
          ● LIVE
        </span>
      </div>

      <div className="events-panel-body">
        {events.length === 0 && (
          <div style={{
            padding: '24px 8px',
            textAlign: 'center',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            color: 'var(--text-3)',
          }}>
            No events yet
          </div>
        )}
        {events.map((ev, i) => (
          <div
            key={ev.id}
            className={`event-item ${ev.id === newId && i === 0 ? 'crost-slide-in' : ''}`}
          >
            <div
              className="event-dot"
              style={{ background: EVENT_COLORS[ev.event_type] ?? 'var(--text-3)' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="event-desc">{ev.description}</div>
              <div className="event-meta">
                <span>{mounted ? timeAgo(ev.created_at) : '...'}</span>
                {ev.department_slug && ev.department_slug !== 'system' && (
                  <span style={{ color: 'var(--text-3)' }}>{ev.department_slug}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
