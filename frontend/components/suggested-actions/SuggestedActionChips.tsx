'use client'

import { useState, useEffect } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'

interface SuggestedActionRow {
  id: string
  action_slug: string
  label: string
  reasoning: string
  risk_level: string
  status: string
}

interface Props {
  entityType: 'artifact' | 'mission_report' | 'memo'
  entityId: string
  onActionExecute?: (action: SuggestedActionRow) => void
}

export function SuggestedActionChips({ entityType, entityId, onActionExecute }: Props) {
  const [actions, setActions] = useState<SuggestedActionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchActions() {
      try {
        const { data, error } = await supabaseClient
          .from('suggested_actions')
          .select('id, action_slug, label, reasoning, risk_level, status')
          .eq('source_entity_type', entityType)
          .eq('source_entity_id', entityId)
          .in('status', ['suggested', 'tapped'])
          .order('created_at', { ascending: true })
          .limit(3)

        if (!error && data) {
          setActions(data)
        }
      } catch (err) {
        console.error('Failed to fetch suggested actions:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchActions()
  }, [entityType, entityId])

  if (loading || actions.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: 8,
        fontFamily: 'var(--font-dm-mono, monospace)',
      }}>
        Suggested Next Steps
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map(action => (
          <button
            key={action.id}
            onClick={async () => {
              if (onActionExecute) {
                onActionExecute(action)
                return
              }
              try {
                const res = await fetch('/api/suggested-actions/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action_id: action.id }),
                })
                const data = await res.json()
                if (!res.ok || !data.success) {
                  console.error('[SuggestedAction] Execution failed:', data.error)
                  return
                }
                if (data.result?.status === 'approval_needed') {
                  console.log('[SuggestedAction] Awaiting approval:', data.result.execution_id)
                } else {
                  console.log('[SuggestedAction] Completed:', data.result)
                }
              } catch (err) {
                console.error('[SuggestedAction] Network error:', err)
              }
            }}
            title={action.reasoning}
            style={{
              padding: '6px 12px',
              borderRadius: 20,
              background: 'rgba(0,255,170,0.08)',
              border: '1px solid rgba(0,255,170,0.2)',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 500,
              fontFamily: 'var(--font-dm-sans, sans-serif)',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(0,255,170,0.15)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(0,255,170,0.08)'
            }}
          >
            {/* Simple icon based on slug */}
            {action.action_slug === 'send_to_email' && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            )}
            {action.action_slug === 'add_to_memo' && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
            )}
            {action.action_slug === 'make_changes' && (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            )}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
