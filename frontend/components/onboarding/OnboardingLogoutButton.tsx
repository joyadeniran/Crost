'use client'

import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase-browser'

export function OnboardingLogoutButton() {
  const router = useRouter()

  const handleLogout = async () => {
    await supabaseClient.auth.signOut()
    router.push('/login')
  }

  return (
    <button onClick={handleLogout} className="onboarding-logout-btn">
      Sign Out
    </button>
  )
}
