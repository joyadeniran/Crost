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
    // Advance immediately as per spec
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
           You can change this anytime in Settings → Control Style.
        </footer>
      </div>

      <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />


    </div>
  )
}
