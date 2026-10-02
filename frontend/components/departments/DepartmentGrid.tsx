'use client'

import { Department } from '@/types'
import { DepartmentCard } from './DepartmentCard'

interface Props {
  departments: Department[]
}

export function DepartmentGrid({ departments }: Props) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {departments.map(dept => (
          <DepartmentCard key={dept.id} department={dept} />
        ))}
      </div>

      {departments.length === 0 && (
        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono)', fontSize: 12 }}>
          <p>Your departments appear here once onboarding is complete.</p>
        </div>
      )}
    </div>
  )
}
