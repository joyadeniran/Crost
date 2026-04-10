'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useOnboardingStore } from '@/lib/onboarding-store'
import { ReflectionBlock } from '@/components/onboarding/ReflectionBlock'
import { ProfileSummary } from '@/components/onboarding/ProfileSummary'

export default function IdentityPage() {
  const router = useRouter()
  const { 
    founderName, companyName, city, country, businessDescription, businessCategory, stage,
    setIdentity 
  } = useOnboardingStore()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [inputName, setInputName] = useState(founderName)
  const [inputCompany, setInputCompany] = useState(companyName)
  const [inputLocation, setInputLocation] = useState(city && country ? `${city}, ${country}` : '')
  const [inputDesc, setInputDesc] = useState(businessDescription)

  // Reflection states
  const [nameReflection, setNameReflection] = useState('')
  const [descReflection, setDescReflection] = useState('')

  useEffect(() => {
    // If we've already filled some out, advance step sequentially
    let currentStep = 1;
    if (founderName && city) {
      currentStep = 2
      setNameReflection(`Hey ${founderName}${companyName ? ` from ${companyName}` : ''}. Building in ${city} — got it.`)
    }
    if (founderName && city && businessDescription) {
      currentStep = 3
      setDescReflection(`${businessCategory}. Noted.`)
    }
    setStep(currentStep)
  }, [founderName, companyName, city, businessDescription, businessCategory])

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const parts = inputLocation.split(',').map(s => s.trim())
    const cityName = parts[0] || ''
    const countryName = parts[1] || ''
    
    setIdentity({ 
      founderName: inputName, 
      companyName: inputCompany,
      city: cityName, 
      country: countryName 
    })
    setNameReflection(`Hey ${inputName} from ${inputCompany}. Building in ${cityName} — got it.`)
    setStep(2)
  }

  const handleBusinessSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/onboarding/interpret-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: inputDesc })
      })
      const data = await res.json()
      
      setIdentity({ 
        businessDescription: inputDesc, 
        businessCategory: data.category 
      })
      setDescReflection(`${data.category}. Noted.`)
      setStep(3)
    } catch (err) {
      setIdentity({ 
        businessDescription: inputDesc, 
        businessCategory: inputDesc 
      })
      setDescReflection(`Got it — I'll learn more as we work.`)
      setStep(3)
    } finally {
      setLoading(false)
    }
  }

  const handleStageSelect = (selectedStage: 'starting' | 'mvp' | 'traction' | 'scaling') => {
    setIdentity({ stage: selectedStage })
    router.push('/onboarding/control')
  }

  return (
    <div className="onboarding-content">
      <div className="main-flow">
        <header className="step-header">
          <span className="time-remaining">~3 min left</span>
          <h1>Nice to meet you.</h1>
        </header>

        <section className="interaction-area">
          {/* Question 1 */}
          <div className={`question-block ${step >= 1 ? 'visible' : ''}`}>
            <p className="prompt">What&apos;s your name, and where are you building?</p>
            {step === 1 ? (
              <form onSubmit={handleIdentitySubmit} className="identity-form animate-fade-in">
                <div className="input-row">
                  <input 
                    type="text" 
                    placeholder="Name" 
                    value={inputName} 
                    onChange={e => setInputName(e.target.value)} 
                    required 
                    autoFocus
                  />
                  <input 
                    type="text" 
                    placeholder="Company Name" 
                    value={inputCompany} 
                    onChange={e => setInputCompany(e.target.value)} 
                    required 
                  />
                  <input 
                    type="text" 
                    placeholder="City, Country" 
                    value={inputLocation} 
                    onChange={e => setInputLocation(e.target.value)} 
                    required 
                  />
                </div>
                <button type="submit" className="submit-btn">→</button>
              </form>
            ) : (
              <ReflectionBlock text={nameReflection} onEdit={() => setStep(1)} />
            )}
          </div>

          {/* Question 2 */}
          {step >= 2 && (
            <div className={`question-block visible animate-fade-in`}>
              <p className="prompt">What does your company do?</p>
              {step === 2 ? (
                <form onSubmit={handleBusinessSubmit} className="business-form">
                  <textarea 
                    placeholder="We help small retailers buy goods on credit..." 
                    value={inputDesc}
                    onChange={e => setInputDesc(e.target.value)}
                    required
                    autoFocus
                  />
                  <button type="submit" className="submit-btn" disabled={loading}>
                    {loading ? '...' : '→'}
                  </button>
                </form>
              ) : (
                <ReflectionBlock text={descReflection} onEdit={() => setStep(2)} />
              )}
            </div>
          )}

          {/* Question 3 */}
          {step >= 3 && (
            <div className={`question-block visible animate-fade-in`}>
              <p className="prompt">What stage are you at?</p>
              <div className="pill-container">
                {['starting', 'mvp', 'traction', 'scaling'].map((s) => (
                  <button 
                    key={s} 
                    className="pill-btn"
                    onClick={() => handleStageSelect(s as any)}
                  >
                    {s === 'starting' ? 'Just starting' : s === 'mvp' ? 'Early MVP' : s === 'traction' ? 'Getting traction' : 'Scaling'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <ProfileSummary state={{ founderName, companyName, city, country, businessCategory, stage }} />


    </div>
  )
}
