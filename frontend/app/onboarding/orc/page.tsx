'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'
import { toast } from '@/components/ui/toaster'

export default function MeetOrcPage() {
  const router = useRouter()
  const {
    founderName,
    companyName,
    city,
    country,
    businessDescription,
    businessCategory,
    stage,
    riskTolerance,
    selectedDepartments,
  } = useOnboardingStore()
  const [loading, setLoading] = useState(false)

  const persistSkip = async (step: 'team') => {
    const res = await fetch('/api/onboarding/complete-final', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step,
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

    if (!res.ok) {
      throw new Error('Unable to save your setup')
    }
  }

  const handleContinue = async () => {
    setLoading(true)
    try {
      await fetch('/api/onboarding/set-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: 'team' }),
      })
      router.push('/onboarding/team')
    } catch (err) {
      console.error('Failed to move to team selection:', err)
      toast('Unable to continue right now.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = async () => {
    setLoading(true)
    try {
      await persistSkip('team')
      window.location.href = '/dashboard'
    } catch (err: any) {
      toast(err.message || 'Unable to skip right now.', 'error')
      setLoading(false)
    }
  }

  return (
    <div className="onboarding-content animate-fade-in">
      <div className="main-flow">
        <button onClick={() => router.push('/onboarding/control')} className="back-link">
          ← Back
        </button>

        <div className="onboarding-panel glass-panel">
          <div className="orc-mark-wrap">
            <Image src="/icon.png" alt="Crost mark" width={44} height={44} />
          </div>

          <span className="time-remaining">~90 sec left</span>
          <h2>Meet Orc — your AI Chief of Staff.</h2>
          <p>
            Orc plans your work, coordinates departments, and helps you run your company.
            Departments are specialist teams Orc activates when needed.
          </p>

          <div className="orc-note-grid">
            <div className="orc-note-card">
              <strong>Strategy first</strong>
              <span>Orc breaks work down, suggests the next move, and keeps your company context in view.</span>
            </div>
            <div className="orc-note-card">
              <strong>Control stays with you</strong>
              <span>Anything external or irreversible still routes through approvals based on the control style you picked.</span>
            </div>
          </div>

          <div className="stage-utility-row" style={{ marginTop: '36px' }}>
            <button type="button" className="skip-link" onClick={() => void handleSkip()} disabled={loading}>
              {loading ? 'Saving…' : 'Skip for now'}
            </button>
            <button type="button" className="primary-btn-crost lg" onClick={() => void handleContinue()} disabled={loading}>
              Continue to Team <span>→</span>
            </button>
          </div>
        </div>
      </div>

      <div className="profile-summary-container">
        <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />
      </div>
    </div>
  )
}
