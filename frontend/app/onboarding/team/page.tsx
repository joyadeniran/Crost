'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { DepartmentCard } from '@/components/onboarding/DepartmentCard'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'
import { toast } from '@/components/ui/toaster'
import { formatErrorMessage } from '@/lib/utils'

function getDepartmentDescription(dept: any) {
  if (typeof dept.onboarding_description === 'string' && dept.onboarding_description.trim()) {
    return dept.onboarding_description.trim()
  }

  const firstSentence = typeof dept.persona_prompt === 'string'
    ? dept.persona_prompt.split('.').find((part: string) => part.trim())
    : ''

  if (firstSentence) {
    return `${firstSentence.trim()}.`
  }

  return `${dept.name} helps move work forward for your company.`
}

function getModelLabel(dept: any) {
  const provider = String(dept.model_provider || 'cloud').toLowerCase()
  const providerLabel = provider === 'local'
    ? 'Local'
    : provider === 'gemini'
      ? 'Gemini'
      : provider === 'claude'
        ? 'Claude'
        : provider === 'groq'
          ? 'Groq'
          : 'Cloud'

  return `○ ${providerLabel}${dept.model_name ? ` · ${dept.model_name}` : ''}`
}

export default function TeamPage() {
  const router = useRouter()
  const { 
    selectedDepartments, toggleDepartment,
    founderName, companyName, city, country, businessCategory, businessDescription, stage, riskTolerance
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

  const handleToggleDepartment = (slug: string) => {
    if (!selectedDepartments.includes(slug) && selectedDepartments.length >= 3) {
      toast('Start with up to 3 departments for now.', 'info')
      return
    }
    toggleDepartment(slug)
  }

  const handleStart = async () => {
    const currentState = useOnboardingStore.getState()
    if (currentState.selectedDepartments.length < 2) {
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
            founderName: currentState.founderName,
            companyName: currentState.companyName,
            city: currentState.city, 
            country: currentState.country, 
            businessDescription: currentState.businessDescription,
            businessCategory: currentState.businessCategory,
            stage: currentState.stage 
          },
          riskTolerance: currentState.riskTolerance,
          selectedDepartments: currentState.selectedDepartments
        })
      })

      if (!res.ok) throw new Error('Failed to save onboarding data')

      router.push('/onboarding/activate')
    } catch (err: any) {
      toast(formatErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setSubmitting(true)
    try {
      const nextStep = selectedDepartments.length >= 2 ? 'activated' : 'team'
      const res = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: nextStep,
          identity: {
            founderName,
            companyName,
            city,
            country,
            businessDescription,
            businessCategory,
            stage,
          },
          riskTolerance,
          selectedDepartments,
        }),
      })

      if (!res.ok) throw new Error('Unable to save your setup')
      window.location.href = '/dashboard'
    } catch (err: any) {
      toast(formatErrorMessage(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="onboarding-content animate-fade-in">
      <div className="main-flow">
        <button onClick={() => router.push('/onboarding/orc')} className="back-link" style={{ marginBottom: '40px', display: 'block', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        <header className="step-header">
          <span className="time-remaining">~90 sec left</span>
          <h1>Pick your starting team.</h1>
          <p className="subtitle" style={{ color: 'rgba(255,255,255,0.5)', marginTop: '16px', fontSize: '18px', maxWidth: '600px' }}>
            Choose 2–3 departments to get your company running. You can always activate more later.
          </p>
        </header>

        {loading ? (
          <div className="loading-state" style={{ padding: '80px 0', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>Finding suitable agents...</div>
        ) : (
          <section className="dept-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', margin: '40px 0' }}>
            {departments.map((dept) => (
              <DepartmentCard 
                key={dept.id}
                name={dept.name}
                slug={dept.slug}
                description={getDepartmentDescription(dept)}
                modelLabel={getModelLabel(dept)}
                selected={selectedDepartments.includes(dept.slug)}
                onClick={() => handleToggleDepartment(dept.slug)}
              />
            ))}
          </section>
        )}

        <footer className="footer-actions" style={{ marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
          <div className="stage-utility-row">
            <button type="button" className="skip-link" onClick={() => void handleSkip()} disabled={submitting}>
              {submitting ? 'Saving…' : 'Skip for now'}
            </button>
            <span className="selection-count" style={{ color: 'rgba(255,255,255,0.4)', fontSize: '14px' }}>
              {selectedDepartments.length}/3 selected
            </span>
          </div>
          <button 
            className="primary-btn-crost lg" 
            disabled={selectedDepartments.length < 2 || submitting}
            onClick={handleStart}
          >
            {submitting ? 'Preparing agents...' : 'Start with these'} <span>→</span>
          </button>
        </footer>
      </div>

      <div className="profile-summary-container">
        <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />
      </div>
    </div>
  )
}
