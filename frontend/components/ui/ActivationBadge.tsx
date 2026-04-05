'use client'

import { ActivationStage } from '@/types'

interface Props {
  stage: ActivationStage
}

export function ActivationBadge({ stage }: Props) {
  return (
    <span className={`crost-activation-badge ${stage}`}>
      {stage.toUpperCase()}
    </span>
  )
}
