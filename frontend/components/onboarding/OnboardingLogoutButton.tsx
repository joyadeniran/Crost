'use client'

import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase-browser'

import { useOnboardingStore } from '@/lib/onboarding-store'

export function OnboardingLogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await supabaseClient.auth.signOut()
    useOnboardingStore.getState().reset()
    localStorage.removeItem('crost-onboarding-storage')
    router.push('/login')
  }

  return (
    <button onClick={handleLogout} className="onboarding-logout-btn">
      Sign Out
    </button>
  )
}
