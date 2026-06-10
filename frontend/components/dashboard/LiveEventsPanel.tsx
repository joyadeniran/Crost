'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabaseClient } from '@/lib/supabase-browser'
import type { EventLogEntry } from '@/types'
import { resolveCrostError } from '@/lib/errors'

const EVENT_COLORS: Record<string, string> = {
  task_started:        '#6366f1', // Indigo for progress
  task_completed:      '#00d4aa',
  task_failed:         '#fb923c', // Amber for intervention
  tool_failed:         '#fb923c',
  approval_requested:  '#ffb347',
  approval_approved:   '#00d4aa',
  approval_rejected:   '#ff4d6d',
  memo_written:        '#a855f7',
  plan_drafted:        '#a855f7',
  orc_rebalance:       '#fbbf24',
  orc_stall_detected:  '#ef4444',
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
    let channel: any;

    ;(async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return

      channel = supabaseClient
        .channel('event-log-live')
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'event_log',
            filter: `created_by=eq.${session.user.id}`
          },
          (payload: any) => {
            const entry = payload.new as EventLogEntry
            setNewId(entry.id)
            setEvents(prev => [entry, ...prev.slice(0, 19)])
          }
        )
        .subscribe()
    })()

    return () => { 
      if (channel) supabaseClient.removeChannel(channel) 
    }
  }, [])

  return (
    <div className="events-panel" style={isHidden ? { display: 'none' } : undefined}>
      <div className="events-panel-header">
        <span className="events-panel-title">LIVE EVENTS</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 8,
            fontWeight: 700,
            color: 'var(--accent)',
            letterSpacing: '0.08em'
          }}>
            LIVE
          </span>
          <span style={{
            width: 4, height: 4,
            borderRadius: '50%',
            background: 'var(--accent)',
            boxShadow: '0 0 4px var(--accent)'
          }}>
            <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
          </span>
        </div>
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
        {events.map((ev, i) => {
          const isError = ['task_failed', 'tool_failed', 'error', 'orc_stall_detected'].includes(ev.event_type)
          const isProgress = ['task_started', 'planning', 'thinking'].includes(ev.event_type)
          const errorData = isError ? resolveCrostError(ev.description) : null

          return (
            <div
              key={ev.id}
              className={`event-item ${ev.id === newId && i === 0 ? 'crost-slide-in' : ''}`}
              style={{ marginBottom: isError ? 12 : 8 }}
            >
              <div
                className={`event-dot ${isProgress ? 'event-dot-breathing' : ''}`}
                style={{ 
                  background: EVENT_COLORS[ev.event_type] ?? 'var(--text-3)',
                  boxShadow: isProgress ? `0 0 8px ${EVENT_COLORS[ev.event_type]}` : 'none'
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                {isError ? (
                  <div className="intervention-block">
                    <div className="intervention-title">Intervention Required</div>
                    <div className="intervention-msg">{errorData?.founderMessage || ev.description}</div>
                    {errorData?.actionLabel && (
                      errorData.actionHref ? (
                        <Link href={errorData.actionHref} className="intervention-action">
                          {errorData.actionLabel} →
                        </Link>
                      ) : (
                        <span className="intervention-action">{errorData.actionLabel} →</span>
                      )
                    )}
                    <div className="intervention-code">{errorData?.code}</div>
                  </div>
                ) : (
                  <div className="event-desc" style={{ color: isProgress ? 'var(--text)' : 'var(--text-2)' }}>
                    {ev.description}
                  </div>
                )}
                
                <div className="event-meta" style={{ marginTop: isError ? 6 : 2 }}>
                  <span>{mounted ? timeAgo(ev.created_at) : '...'}</span>
                  {ev.department_slug && ev.department_slug !== 'system' && (
                    <span style={{ color: 'var(--text-4)', textTransform: 'uppercase', fontSize: 8 }}>
                      {ev.department_slug}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

