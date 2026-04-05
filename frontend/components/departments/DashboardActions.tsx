'use client'

import { useState } from 'react'
import { CreateDepartmentWizard } from './CreateDepartmentWizard'

export function DashboardActions() {
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setWizardOpen(true)}
        className="btn-primary-crost"
      >
        <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
        New Department
      </button>
      {wizardOpen && <CreateDepartmentWizard onClose={() => setWizardOpen(false)} />}
    </>
  )
}
