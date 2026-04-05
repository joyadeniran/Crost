'use client'

import { useRouter } from 'next/navigation'
import { CreateDepartmentWizard } from '@/components/departments/CreateDepartmentWizard'

export default function NewDepartmentPage() {
  const router = useRouter()
  return (
    <div>
      <CreateDepartmentWizard onClose={() => router.push('/dashboard')} />
    </div>
  )
}
