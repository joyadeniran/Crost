'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { DepartmentCard } from '@/components/onboarding/DepartmentCard'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'
import { toast } from '@/components/ui/toaster'

export default function TeamPage() {
  const router = useRouter()
  const { 
    selectedDepartments, toggleDepartment,
    founderName, companyName, city, country, businessCategory, stage
  } = useOnboardingStore()

  const [departments, setDepartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function fetchDepts() {
      try {
        const res = await fetch('/api/departments?scope=templates&active_only=true')
        const json = await res.json()
        if (json.data) {
          const filtered = json.data
            .filter((d: any) => !d.is_orchestrator)
            .slice(0, 6) // Max 6 as per spec
          setDepartments(filtered)
        }
      } catch (err) {
        console.error('Failed to fetch departments:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDepts()
  }, [])

  const handleStart = async () => {
    if (selectedDepartments.length < 2) {
      toast('Please select at least 2 departments to start.', 'error')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: { 
            founder_name: founderName,
            company_name: useOnboardingStore.getState().companyName,
            city, 
            country, 
            business_description: useOnboardingStore.getState().businessDescription,
            business_category: businessCategory,
            stage 
          },
          riskTolerance: useOnboardingStore.getState().riskTolerance,
          selectedDepartments
        })
      })

      if (!res.ok) throw new Error('Failed to save onboarding data')

      router.push('/onboarding/activate')
    } catch (err: any) {
      toast(err.message || 'Something went wrong.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="onboarding-content">
      <div className="main-flow">
        <button onClick={() => router.push('/onboarding/control')} className="back-link">
          ← Back to Control Style
        </button>
        <header className="step-header">
          <span className="time-remaining">~90 sec left</span>
          <h1>Pick your starting team.</h1>
          <p className="subtitle">
            Choose 2–3 departments to get your company running. You can always activate more later.
          </p>
        </header>

        {loading ? (
          <div className="loading-state">Finding suitable agents...</div>
        ) : (
          <section className="dept-grid">
            {departments.map((dept) => (
              <DepartmentCard 
                key={dept.id}
                name={dept.name}
                slug={dept.slug}
                description={dept.persona_prompt.split('.')[0] + '.'}
                selected={selectedDepartments.includes(dept.slug)}
                onClick={() => toggleDepartment(dept.slug)}
              />
            ))}
          </section>
        )}

        <footer className="footer-actions">
           <button 
             className="start-btn" 
             disabled={selectedDepartments.length < 2 || submitting}
             onClick={handleStart}
           >
             {submitting ? 'Preparing agents...' : 'Start with these'}
           </button>
           <span className="selection-count">
             {selectedDepartments.length} {selectedDepartments.length === 1 ? 'department' : 'departments'} selected
           </span>
        </footer>
      </div>

      <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />


    </div>
  )
}
