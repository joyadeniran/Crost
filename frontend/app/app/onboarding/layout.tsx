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
      className="onboarding-wrapper relative"
    >
      <div className="onboarding-top-bar">
        <OnboardingLogoutButton />
      </div>
      {children}
    </div>
  )
}
