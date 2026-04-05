'use client'

import { DepartmentStatus } from '@/types'

const STATUS_LABELS: Record<DepartmentStatus, string> = {
  idle:              'IDLE',
  running:           'RUNNING',
  awaiting_approval: 'APPROVAL',
  error:             'ERROR',
  paused:            'PAUSED',
}

interface Props {
  status: DepartmentStatus
  showLabel?: boolean
}

export function PulseIndicator({ status, showLabel = false }: Props) {
  const cls = status === 'awaiting_approval' ? 'awaiting' : status

  if (showLabel) {
    return (
      <span className={`crost-status-badge ${cls}`}>
        <span className={`crost-pulse-dot ${cls}`} />
        {STATUS_LABELS[status] ?? status.toUpperCase()}
      </span>
    )
  }

  return <span className={`crost-pulse-dot ${cls}`} />
}
