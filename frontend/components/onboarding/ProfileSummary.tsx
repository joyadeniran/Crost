'use client'

import { OnboardingState } from '@/lib/onboarding-store'

export function ProfileSummary({ state }: { state: Partial<OnboardingState> }) {
  const { founderName, city, country, businessCategory, stage } = state

  return (
    <aside className="profile-summary">
      <div className="card-header">
        <h3>Founder Profile</h3>
        <span className="status-dot"></span>
      </div>
      
      <div className="summary-list">
        <div className={`summary-item ${founderName ? 'active' : ''}`}>
          <label>Founder</label>
          <div className="value">{founderName || '—'}</div>
        </div>

        <div className={`summary-item ${city ? 'active' : ''}`}>
          <label>Base</label>
          <div className="value">{city}{city && country ? `, ${country}` : country || '—'}</div>
        </div>

        <div className={`summary-item ${state.companyName ? 'active' : ''}`}>
          <label>Company</label>
          <div className="value">{state.companyName || '—'}</div>
        </div>

        <div className={`summary-item ${businessCategory ? 'active' : ''}`}>
          <label>Industry</label>
          <div className="value">{businessCategory || '—'}</div>
        </div>

        <div className={`summary-item ${stage ? 'active' : ''}`}>
          <label>Stage</label>
          <div className="value" style={{ textTransform: 'capitalize' }}>{stage || '—'}</div>
        </div>
      </div>


    </aside>
  )
}
