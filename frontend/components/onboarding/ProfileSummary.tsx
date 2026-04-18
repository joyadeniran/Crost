'use client'

import { useState, useEffect } from 'react'
import { OnboardingState } from '@/lib/onboarding-store'

export function ProfileSummary({ state }: { state: Partial<OnboardingState> }) {
  const [mounted, setVisible] = useState(false)
  useEffect(() => { setVisible(true) }, [])

  const { founderName, city, country, companyName, businessCategory, stage } = state

  if (!mounted) return null

  return (
    <aside className="profile-summary glass-panel animate-fade-in">
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

        <div className={`summary-item ${companyName ? 'active' : ''}`}>
          <label>Company</label>
          <div className="value">{companyName || '—'}</div>
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

      <style jsx>{`
        .profile-summary {
          padding: 28px;
          border-radius: 24px;
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .card-header h3 {
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: rgba(255,255,255,0.4);
          margin: 0;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          background: var(--accent);
          border-radius: 50%;
          box-shadow: 0 0 12px var(--accent);
        }
        .summary-list {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .summary-item {
          opacity: 0.3;
          transition: all 0.3s ease;
        }
        .summary-item.active {
          opacity: 1;
        }
        .summary-item label {
          display: block;
          font-size: 11px;
          color: rgba(255,255,255,0.4);
          margin-bottom: 4px;
          font-family: var(--font-dm-mono), monospace;
        }
        .summary-item .value {
          font-size: 15px;
          color: #fff;
          font-weight: 500;
        }
      `}</style>
    </aside>
  )
}
