'use client'

import '@/app/globals.css'
import { OnboardingLogoutButton } from '@/components/onboarding/OnboardingLogoutButton'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="onboarding-wrapper"
      style={{ position: 'relative', ['--font-fraunces' as string]: 'var(--font-syne)' }}
    >
      <div className="onboarding-top-bar">
        <OnboardingLogoutButton />
      </div>
      {children}
    </div>
  )
}
