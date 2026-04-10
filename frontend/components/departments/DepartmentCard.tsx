'use client'

import Link from 'next/link'
import { Department } from '@/types'
import { PulseIndicator } from '@/components/ui/PulseIndicator'
import { ActivationBadge } from '@/components/ui/ActivationBadge'
import { SyncFailedBadge } from '@/components/ui/SyncFailedBadge'

// Map legacy icon-name strings → emoji for departments created before the wizard change
const ICON_MAP: Record<string, string> = {
  'briefcase':   '💼',
  'code':        '💻',
  'code-2':      '💻',
  'megaphone':   '📣',
  'handshake':   '🤝',
  'bar-chart-2': '📊',
  'chart':       '📊',
  'settings-2':  '⚙️',
  'ops':         '⚙️',
  'shield':      '🛡️',
  'flask':       '🧪',
  'globe':       '🌐',
  'users':       '👥',
  'zap':         '⚡',
  'dollar-sign': '💰',
}

function resolveIcon(icon: string): string {
  return ICON_MAP[icon] ?? icon
}

interface Props {
  department: Department
}

export function DepartmentCard({ department: dept }: Props) {
  const isActive = dept.status === 'running' || dept.status === 'awaiting_approval'
  // No per-department token counter in schema; show 0 until we add it
  const tokenPct = 0
  const tokenColor = 'var(--accent)'

  return (
    <Link
      href={`/dashboard/departments/${dept.slug}`}
      className={`dept-card ${isActive ? 'dept-card-active' : ''}`}
    >
      {/* Colored top bar */}
      <div className="dept-card-top-bar" style={{ background: dept.color }} />

      {/* Header */}
      <div className="dept-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="dept-icon-wrap" style={{ background: dept.color + '22' }}>
            {resolveIcon(dept.icon)}
          </div>
          <div>
            <div className="dept-name">{dept.name}</div>
            <div className="dept-slug">/{dept.slug}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <PulseIndicator status={dept.status} showLabel />
          {dept.activation_stage !== 'active' && (
            <ActivationBadge stage={dept.activation_stage} />
          )}
          {dept.activation_stage === 'active' && (
            <SyncFailedBadge personaId={dept.orc_persona_id} slug={dept.slug} />
          )}
        </div>
      </div>

      {/* Current task */}
      <div className={`dept-task ${!dept.current_task ? 'empty' : ''}`}>
        {dept.current_task || 'No active task'}
      </div>

      {/* Footer */}
      <div className="dept-footer">
        <span className="dept-model">{dept.model_name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="token-bar-wrap">
            <div className="token-bar" style={{ width: `${tokenPct}%`, background: tokenColor }} />
          </div>
          <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)' }}>
            {tokenPct}%
          </span>
        </div>
      </div>
    </Link>
  )
}
