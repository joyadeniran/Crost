'use client'

import { Fraunces, DM_Sans, DM_Mono } from 'next/font/google'
import '@/app/globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

import { OnboardingLogoutButton } from '@/components/onboarding/OnboardingLogoutButton'

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable} onboarding-wrapper`} style={{ position: 'relative' }}>
      <div className="onboarding-top-bar">
        <OnboardingLogoutButton />
      </div>
      {children}

    </div>
  )
}
