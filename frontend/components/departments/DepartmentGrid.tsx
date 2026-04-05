'use client'

import Link from 'next/link'
import { Department } from '@/types'
import { DepartmentCard } from './DepartmentCard'

interface Props {
  departments: Department[]
  onCreateClick?: () => void
}

function NewDepartmentCard({ onClick }: { onClick?: () => void }) {
  const inner = (
    <>
      <div style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: '1px dashed rgba(255,255,255,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        color: 'rgba(255,255,255,0.3)',
      }}>
        +
      </div>
      <span className="add-dept-label">NEW DEPARTMENT</span>
    </>
  )

  if (onClick) {
    return (
      <button onClick={onClick} className="add-dept-card" style={{ width: '100%' }}>
        {inner}
      </button>
    )
  }
  return (
    <Link href="/dashboard/departments/new" className="add-dept-card">
      {inner}
    </Link>
  )
}

export function DepartmentGrid({ departments, onCreateClick }: Props) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {departments.map(dept => (
          <DepartmentCard key={dept.id} department={dept} />
        ))}
        <NewDepartmentCard onClick={onCreateClick} />
      </div>

      {departments.length === 0 && (
        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12 }}>
          <p style={{ marginBottom: 4 }}>No departments yet</p>
          <p>Create your first AI department to get started.</p>
        </div>
      )}
    </div>
  )
}
