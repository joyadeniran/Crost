'use client'

import { useState, useMemo } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { useEffect } from 'react'
import type { EventLogEntry, EventType } from '@/types'

const EVENT_COLOR: Partial<Record<EventType, string>> = {
  task_completed:      'var(--accent)',
  task_started:        'var(--blue)',
  task_failed:         'var(--red)',
  approval_requested:  'var(--amber)',
  approval_approved:   'var(--accent)',
  approval_rejected:   'var(--red)',
  approval_expired:    'var(--text-3)',
  action_executed:     'var(--accent)',
  action_execution_failed: 'var(--red)',
  memo_written:        'var(--blue)',
  tool_called:         'var(--blue)',
  unauthorised_tool_call: 'var(--red)',
  error:               'var(--red)',
  mode_switched:       'var(--amber)',
  token_limit_hit:     'var(--amber)',
  department_created:  'var(--accent)',
  department_updated:  'var(--blue)',
  department_activated:'var(--accent)',
  department_deprecated:'var(--text-3)',
}

const EVENT_TYPE_OPTIONS: EventType[] = [
  'task_started', 'task_completed', 'task_failed',
  'approval_requested', 'approval_approved', 'approval_rejected',
  'action_executed', 'memo_written', 'tool_called',
  'department_created', 'department_updated', 'error',
]

interface Props {
  events: EventLogEntry[]
}

export function EventLogClient({ events: initial }: Props) {
  const [events, setEvents] = useState<EventLogEntry[]>(initial)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [deptFilter, setDeptFilter] = useState<string>('all')

  // Live updates
  useEffect(() => {
    const channel = supabaseClient
      .channel('event-log-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_log' }, (payload) => {
        setEvents(prev => [payload.new as EventLogEntry, ...prev].slice(0, 200))
      })
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [])

  // Unique dept slugs for filter
  const deptOptions = useMemo(() => {
    const slugs = [...new Set(events.map(e => e.department_slug).filter(Boolean) as string[])]
    return slugs.sort()
  }, [events])

  const filtered = useMemo(() => {
    return events.filter(ev => {
      if (typeFilter !== 'all' && ev.event_type !== typeFilter) return false
      if (deptFilter !== 'all' && ev.department_slug !== deptFilter) return false
      if (search && !ev.description.toLowerCase().includes(search.toLowerCase()) &&
          !ev.event_type.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [events, typeFilter, deptFilter, search])

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
    fontFamily: 'var(--font-dm-sans, sans-serif)',
    fontSize: 12,
    padding: '6px 10px',
    outline: 'none',
  }

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search events…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, flex: '1 1 160px', minWidth: 160 }}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="all">All types</option>
          {EVENT_TYPE_OPTIONS.map(t => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        {deptOptions.length > 0 && (
          <select
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="all">All departments</option>
            {deptOptions.map(slug => (
              <option key={slug} value={slug}>{slug}</option>
            ))}
          </select>
        )}
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          padding: '6px 4px',
          alignSelf: 'center',
        }}>
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '40px 0' }}>
          No events match your filters.
        </div>
      ) : (
        <div style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
        }}>
          {filtered.map((ev, idx) => {
            const color = EVENT_COLOR[ev.event_type] ?? 'var(--text-3)'
            return (
              <div
                key={ev.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 160px 1fr auto',
                  gap: 16,
                  alignItems: 'center',
                  padding: '11px 16px',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                  fontSize: 12,
                }}
              >
                {/* Time */}
                <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)' }}>
                  {new Date(ev.created_at).toLocaleString([], {
                    month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>

                {/* Type badge */}
                <span style={{
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  fontSize: 9,
                  padding: '2px 7px',
                  borderRadius: 4,
                  background: color + '15',
                  color,
                  border: `1px solid ${color}30`,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {ev.event_type.replace(/_/g, ' ')}
                </span>

                {/* Description */}
                <span style={{ color: 'var(--text-2)', lineHeight: 1.4 }}>{ev.description}</span>

                {/* Dept + tokens */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  {ev.department_slug && (
                    <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--text-3)' }}>
                      /{ev.department_slug}
                    </span>
                  )}
                  {ev.tokens_used > 0 && (
                    <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--accent)' }}>
                      {ev.tokens_used.toLocaleString()} tok
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
