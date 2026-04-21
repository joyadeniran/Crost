'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { ControlStyleCard } from '@/components/onboarding/ControlStyleCard'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'
import { toast } from '@/components/ui/toaster'

const OPTIONS = [
  {
    id: 'careful' as const,
    title: 'Careful',
    description: 'Ask before most actions.',
    details: 'Best for high-stakes decisions or early-stage founders.'
  },
  {
    id: 'balanced' as const,
    title: 'Balanced',
    description: 'Approvals on high-stakes only.',
    details: 'Good default for most founders.'
  },
  {
    id: 'aggressive' as const,
    title: 'Aggressive',
    description: 'Move fast, fewer interruptions.',
    details: 'Best when speed matters most.'
  }
]

export default function ControlPage() {
  const router = useRouter()
  const { 
    riskTolerance, setRiskTolerance,
    founderName, companyName, city, country, businessCategory, businessDescription, stage, selectedDepartments
  } = useOnboardingStore()

  const [localRisk, setLocalRisk] = useState<'careful' | 'balanced' | 'aggressive'>(riskTolerance || 'balanced')
  const [skipping, setSkipping] = useState(false)

  const handleSelect = async (id: 'careful' | 'balanced' | 'aggressive') => {
    setLocalRisk(id)
    setRiskTolerance(id)
    await fetch('/api/onboarding/set-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'orc' })
    }).catch((err) => console.error('Failed to update onboarding step:', err))
    router.push('/onboarding/orc')
  }

  const handleSkip = async () => {
    setSkipping(true)
    try {
      const res = await fetch('/api/onboarding/complete-final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'orc',
          identity: {
            founderName,
            companyName,
            city,
            country,
            businessDescription,
            businessCategory,
            stage,
          },
          riskTolerance: localRisk,
          selectedDepartments,
        }),
      })

      if (!res.ok) throw new Error('Unable to save your setup')
      window.location.href = '/dashboard'
    } catch (err: any) {
      toast(err.message || 'Unable to skip right now.', 'error')
    } finally {
      setSkipping(false)
    }
  }

  return (
    <div className="onboarding-content animate-fade-in">
      <div className="main-flow">
        <button onClick={() => router.push('/onboarding/identity')} className="back-link" style={{ marginBottom: '40px', display: 'block', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '14px' }}>
          ← Back
        </button>
        <header className="step-header">
          <span className="time-remaining">~2 min left</span>
          <h1>How do you want to operate?</h1>
          <p className="subtitle" style={{ color: 'rgba(255,255,255,0.5)', marginTop: '16px', fontSize: '18px', maxWidth: '600px' }}>
            This sets your risk tolerance. Your team operates under the Crost Constitution — 
            agents never act without your sign-off on anything irreversible.
          </p>
        </header>

        <section className="control-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', margin: '40px 0' }}>
          {OPTIONS.map(opt => (
            <ControlStyleCard 
              key={opt.id}
              {...opt}
              selected={localRisk === opt.id}
              onClick={() => void handleSelect(opt.id)}
            />
          ))}
        </section>

        <div className="stage-utility-row animate-fade-in">
          <button
            type="button"
            className="skip-link"
            onClick={() => void handleSkip()}
            disabled={skipping}
          >
            {skipping ? 'Saving…' : 'Skip for now'}
          </button>
          <span className="footer-note">Pick any card to continue to Meet Orc.</span>
        </div>

        <footer className="footer-note" style={{ marginTop: '32px', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>
          <p>You can change this anytime in Settings → Control Style.</p>
        </footer>
      </div>

      <div className="profile-summary-container">
        <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />
      </div>
    </div>
  )
}
