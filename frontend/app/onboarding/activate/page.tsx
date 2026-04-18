'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { supabaseClient } from '@/lib/supabase-browser'
import { ProgressLine } from '@/components/onboarding/ProgressLine'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'
import { toast } from '@/components/ui/toaster'

const PLACEHOLDERS: Record<string, string[]> = {
  fintech: ["Get 50 retailers onboarded this month", "Automate credit assessments for new leads", "Design the merchant dashboard experience"],
  saas: ["Get our first 10 paying customers", "Launch the public API documentation", "Draft the investor pitch deck for seed round"],
  default: ["Launch our first marketing campaign", "Reach $10k in Monthly Recurring Revenue", "Onboard the next 3 team members"]
}

export default function ActivatePage() {
  const router = useRouter()
  const { 
    selectedDepartments, businessCategory, founderName, companyName, city, country, stage,
    setFirstGoal, setOrcPlan 
  } = useOnboardingStore()

  const [phase, setPhase] = useState<1 | 2 | 3>(1)
  const [goal, setGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [completeCount, setCompleteCount] = useState(0)
  const [progress, setProgress] = useState(1)
  const [showRedirect, setShowRedirect] = useState(false)

  // Determine placeholders based on category
  const placeholders = PLACEHOLDERS[businessCategory.toLowerCase()] || 
                       (businessCategory.toLowerCase().includes('fintech') || businessCategory.toLowerCase().includes('credit') ? PLACEHOLDERS.fintech :
                        businessCategory.toLowerCase().includes('saas') || businessCategory.toLowerCase().includes('software') ? PLACEHOLDERS.saas : 
                        PLACEHOLDERS.default)
  
  const [placeholder, setPlaceholder] = useState(placeholders[0])

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      i = (i + 1) % placeholders.length
      setPlaceholder(placeholders[i])
    }, 4000)
    return () => clearInterval(interval)
  }, [placeholders])

  useEffect(() => {
    // If all selected + Orc have "initialized", advance to phase 2
    if (completeCount >= selectedDepartments.length + 1) {
      setTimeout(() => setPhase(2), 800)
    }
  }, [completeCount, selectedDepartments])

  // Fake but progressive status updates while waiting for Orc
  useEffect(() => {
    if (phase === 3) {
      const pInterval = setInterval(() => {
        setProgress(prev => (prev < 3 ? prev + 1 : prev))
      }, 2500)
      
      const rTimeout = setTimeout(() => setShowRedirect(true), 12000)
      
      return () => {
        clearInterval(pInterval)
        clearTimeout(rTimeout)
      }
    }
  }, [phase])

  const finalizeAndRedirect = async () => {
    try {
      // Force session refresh so the middleware sees the updated 'complete' metadata
      await supabaseClient.auth.refreshSession()
    } catch (err) {
      console.error('Session refresh failed (non-fatal):', err)
    }
    // Hard redirect so the browser re-validates session cookies with the server
    window.location.href = '/dashboard'
  }

  const handleGoalSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!goal) return
    
    setPhase(3)
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/first-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      })
      const data = await res.json()

      if (data.plan) {
        setOrcPlan(data.plan)
        setFirstGoal(goal)
      }

      if (data.goal_id) {
        try { localStorage.setItem('crost-pending-goal-id', data.goal_id) } catch {}
      }

      setProgress(4)
      setTimeout(finalizeAndRedirect, 2000)
    } catch (err) {
      console.error('Goal processing failed:', err)
      toast('Orc is still thinking, but let\'s head to the dashboard.', 'info')
      setTimeout(finalizeAndRedirect, 2000)
    }
  }

  const handleSkip = async () => {
    setLoading(true)
    try {
      await fetch('/api/onboarding/complete-final', { method: 'POST' })
      await finalizeAndRedirect()
    } catch (err) {
      router.push('/dashboard')
    }
  }

  return (
    <div className="onboarding-content animate-fade-in">
      <div className="main-flow">
        <div className="activation-shell glass-panel" style={{ padding: '60px', width: '100%', borderRadius: '24px' }}>
          {phase === 1 && (
            <div className="phase-vignette animate-fade-in">
               <header className="activation-header" style={{ marginBottom: '40px' }}>
                 <h1 style={{ fontSize: '32px', marginBottom: '12px' }}>Initialising your team...</h1>
                 <p style={{ color: 'rgba(255,255,255,0.5)' }}>Setting up context for {selectedDepartments.join(' & ')}</p>
               </header>

               <div className="progress-stack">
                 {selectedDepartments.map((slug, idx) => (
                   <ProgressLine 
                     key={slug}
                     label={slug.toUpperCase()}
                     status={completeCount > idx ? "Ready" : "Loading business brief"}
                     duration={2000 + (idx * 1500)}
                     onComplete={() => setCompleteCount(prev => prev + 1)}
                   />
                 ))}
                 <ProgressLine 
                   label="ORC"
                   status={completeCount > selectedDepartments.length ? "Operational" : "Synchronizing system..."}
                   duration={7000}
                   onComplete={() => setCompleteCount(prev => prev + 1)}
                 />
               </div>
            </div>
          )}

          {phase === 2 && (
            <div className="phase-vignette animate-fade-in">
              <header className="activation-header" style={{ marginBottom: '40px' }}>
                 <h1 style={{ fontSize: '32px', marginBottom: '12px' }}>Your team is ready.</h1>
                 <p style={{ color: 'rgba(255,255,255,0.5)' }}>What&apos;s the first thing you want to get done?</p>
               </header>

               <form onSubmit={handleGoalSubmit} className="goal-input-area" style={{ position: 'relative' }}>
                  <textarea 
                    className="goal-textarea glass-panel"
                    style={{ width: '100%', minHeight: '160px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '24px', borderRadius: '16px', color: '#fff', fontSize: '18px', resize: 'none' }}
                    placeholder={placeholder}
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    autoFocus
                  />
                  <div className="action-row" style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button type="button" onClick={handleSkip} className="skip-btn" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '14px' }}>Skip for now</button>
                    <button type="submit" className="primary-btn-crost lg" disabled={!goal || loading}>
                      {loading ? 'Processing...' : 'Activate Orc →'}
                    </button>
                  </div>
               </form>
            </div>
          )}

          {phase === 3 && (
            <div className="phase-vignette animate-fade-in">
              <header className="activation-header" style={{ marginBottom: '40px', textAlign: 'center' }}>
                 <h1 style={{ fontSize: '32px' }}>Orc is breaking this down...</h1>
              </header>

              <div className="orc-status-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className={`orc-status-item ${progress === 1 ? 'running' : progress > 1 ? 'complete' : 'pending'}`} style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16px', color: progress >= 1 ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                  {progress === 1 && <div className="spinner"></div>}
                  {progress > 1 && <span className="check" style={{ color: 'var(--accent)' }}>✓</span>}
                  <span>Querying your team&apos;s capabilities</span>
                </div>
                <div className={`orc-status-item ${progress === 2 ? 'running' : progress > 2 ? 'complete' : 'pending'}`} style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16px', color: progress >= 2 ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                  {progress === 2 && <div className="spinner"></div>}
                  {progress > 2 && <span className="check" style={{ color: 'var(--accent)' }}>✓</span>}
                  <span>Drafting the plan</span>
                </div>
                <div className={`orc-status-item ${progress === 3 ? 'running' : progress > 3 ? 'complete' : 'pending'}`} style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '16px', color: progress >= 3 ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                  {progress === 3 && <div className="spinner"></div>}
                  {progress > 3 && <span className="check" style={{ color: 'var(--accent)' }}>✓</span>}
                  <span>Preparing your first approvals</span>
                </div>
              </div>
              
              <div className="activation-footer" style={{ marginTop: '48px', textAlign: 'center' }}>
                <p className="redirect-note" style={{ opacity: 0.6, fontSize: '14px' }}>Preparing your dashboard...</p>
                
                {showRedirect && (
                  <button 
                    onClick={() => router.push('/dashboard')}
                    className="secondary-button"
                    style={{ marginTop: '24px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '12px 24px', borderRadius: '100px', cursor: 'pointer' }}
                  >
                    Taking too long? Go to Dashboard →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="profile-summary-container">
        <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />
      </div>

      <style jsx>{`
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(0, 212, 170, 0.2);
          border-top-color: var(--accent);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
