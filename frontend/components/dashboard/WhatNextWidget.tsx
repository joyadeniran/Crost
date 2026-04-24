import Link from 'next/link'

interface SuggestedAction {
  id: string
  action_slug: string
  label: string
  reasoning: string
  risk_level: string
  source_entity_type: string
  source_entity_id: string
  created_at: string
}

interface Props {
  actions: SuggestedAction[]
}

const ACTION_ICONS: Record<string, string> = {
  send_to_email: '✉️',
  add_to_memo: '📝',
  make_changes: '✏️',
  send_to_contact: '👤',
  save_to_kb: '📚',
  schedule_recurring: '📅',
  generate_companion: '📄',
  share_with_teammate: '👥',
  draft_followup: '↩️',
  start_new_mission: '🚀',
}

export function WhatNextWidget({ actions }: Props) {
  if (!actions || actions.length === 0) return null

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      marginBottom: 20,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <div style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--accent)',
          letterSpacing: '0.08em',
        }}>
          WHAT NEXT?
        </div>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          color: 'var(--text-4)',
        }}>
          {actions.length} suggestion{actions.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((action) => (
          <Link
            key={action.id}
            href={`/dashboard/artifacts/${action.source_entity_id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.05)',
              textDecoration: 'none',
              transition: 'all 0.15s',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              e.currentTarget.style.borderColor = 'rgba(0,255,170,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>
              {ACTION_ICONS[action.action_slug] ?? '💡'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {action.label}
              </div>
              <div style={{
                fontSize: 11,
                color: 'var(--text-4)',
                marginTop: 2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {action.reasoning}
              </div>
            </div>
            <span style={{
              fontSize: 9,
              fontFamily: 'var(--font-dm-mono, monospace)',
              color: action.risk_level === 'low' ? '#4ade80'
                : action.risk_level === 'medium' ? '#facc15'
                : action.risk_level === 'high' ? '#fb923c'
                : '#f87171',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}>
              {action.risk_level}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
