'use client'

import { useState, useMemo } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
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
  tool_executed:       'var(--accent)',
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
  'action_executed', 'memo_written', 'tool_called', 'tool_executed',
  'department_created', 'department_updated', 'error',
]

interface Props {
  events: EventLogEntry[]
  /** Pre-set from URL ?goal_id= (WarRoom deep-link) */
  initialGoalId?: string | null
  /** Pre-set from URL ?type= (WarRoom deep-link) */
  initialType?: string | null
}

export function EventLogClient({ events: initial, initialGoalId, initialType }: Props) {
  const [events, setEvents] = useState<EventLogEntry[]>(initial)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initial.length === 50)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>(initialType ?? 'all')
  const [deptFilter, setDeptFilter] = useState<string>('all')
  // goal_id scope — set when arriving via deep-link, clearable
  const [goalScope, setGoalScope] = useState<string | null>(initialGoalId ?? null)

  // Live updates
  useEffect(() => {
    const channel = supabaseClient
      .channel('event-log-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_log' }, (payload) => {
        setEvents(prev => [payload.new as EventLogEntry, ...prev])
      })
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [])

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)

    // Fetch next 50
    const lastEvent = events[events.length - 1]
    const { data, error } = await supabaseClient
      .from('event_log')
      .select('id, created_at, event_type, description, department_slug, department_id, goal_id, tokens_used')
      .lt('created_at', lastEvent.created_at)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error loading more events:', error)
    } else {
      const more = data as EventLogEntry[]
      if (more.length < 50) setHasMore(false)
      setEvents(prev => [...prev, ...more])
    }
    setLoadingMore(false)
  }

  // Unique dept slugs for filter
  const deptOptions = useMemo(() => {
    const slugs = [...new Set(events.map(e => e.department_slug).filter(Boolean) as string[])]
    return slugs.sort()
  }, [events])

  const filtered = useMemo(() => {
    return events.filter(ev => {
      if (typeFilter !== 'all' && ev.event_type !== typeFilter) return false
      if (deptFilter !== 'all' && ev.department_slug !== deptFilter) return false
      // goalScope client-side guard (server already scoped, but keep in sync for UI)
      if (goalScope && (ev as any).goal_id && (ev as any).goal_id !== goalScope) return false
      if (search && !ev.description.toLowerCase().includes(search.toLowerCase()) &&
          !ev.event_type.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [events, typeFilter, deptFilter, goalScope, search])

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
      {/* Goal-scoped filter banner — shown when arriving via WarRoom deep-link */}
      {goalScope && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(239,68,68,0.07)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 6,
          padding: '7px 12px',
          marginBottom: 12,
          fontSize: 11,
          fontFamily: 'var(--font-dm-mono, monospace)',
          color: '#f87171',
        }}>
          <span style={{ flex: 1 }}>Filtered to goal: <strong style={{ letterSpacing: '0.03em' }}>{goalScope.slice(0, 8)}…</strong></span>
          <button
            onClick={() => { setGoalScope(null); setTypeFilter('all') }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 10,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            clear filter ×
          </button>
        </div>
      )}

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
          {filtered.length} {filtered.length === 1 ? 'event' : 'events'}
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
          marginBottom: 16
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
                  {ev.event_type.replace(/_/g, ' ').replace('goal post mortem written', 'mission report written')}
                </span>

                {/* Description */}
                <span style={{ color: 'var(--text-2)', lineHeight: 1.4 }}>
                  {ev.description.replace(/Post-mortem/g, 'Mission Report')}
                </span>

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

      {/* Pagination */}
      {hasMore && (
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            style={{
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 10,
              fontFamily: 'var(--font-dm-mono, monospace)',
              padding: '8px 24px',
              cursor: loadingMore ? 'default' : 'pointer',
              opacity: loadingMore ? 0.7 : 1,
              transition: 'all 0.15s'
            }}
          >
            {loadingMore ? 'LOADING…' : 'LOAD MORE ACTIVITIES'}
          </button>
        </div>
      )}

      {!hasMore && events.length > 5 && (
        <div style={{ 
          textAlign: 'center', 
          fontSize: 10, 
          color: 'var(--text-4)', 
          fontFamily: 'var(--font-dm-mono, monospace)',
          marginBottom: 40
        }}>
          END OF LOG
        </div>
      )}
    </>
  )
}
