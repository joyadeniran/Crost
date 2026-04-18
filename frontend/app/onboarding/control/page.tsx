'use client'

import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { ControlStyleCard } from '@/components/onboarding/ControlStyleCard'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'

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
    founderName, companyName, city, country, businessCategory, stage
  } = useOnboardingStore()

  const handleSelect = (id: 'careful' | 'balanced' | 'aggressive') => {
    setRiskTolerance(id)
  }

  const handleProceed = async () => {
    await fetch('/api/onboarding/set-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'team' })
    }).catch(err => console.error('Failed to update onboarding step:', err))
    router.push('/onboarding/team')
  }

  return (
    <div className="onboarding-content">
      <div className="main-flow">
        <button onClick={() => router.push('/onboarding/identity')} className="back-link">
          ← Back to Identity
        </button>
        <header className="step-header">
          <span className="time-remaining">~2 min left</span>
          <h1>How do you want to operate?</h1>
          <p className="subtitle">
            This sets your risk tolerance. Your team operates under the Crost Constitution — 
            agents never act without your sign-off on anything irreversible.
          </p>
        </header>

        <section className="control-grid">
          {OPTIONS.map(opt => (
            <ControlStyleCard 
              key={opt.id}
              {...opt}
              selected={riskTolerance === opt.id}
              onClick={() => handleSelect(opt.id)}
            />
          ))}
        </section>

        <footer className="footer-note">
          <p>You can change this anytime in Settings → Control Style.</p>
          <button
            onClick={handleProceed}
            disabled={!riskTolerance}
            className="proceed-btn"
          >
            → Proceed
          </button>
        </footer>
      </div>

      <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />


    </div>
  )
}
