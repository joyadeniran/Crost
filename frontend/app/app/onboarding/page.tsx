import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase'

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/app'
  if (step === 'activated') return '/app/onboarding/activate'
  if (step === 'orc') return '/app/onboarding/orc'
  return '/app/onboarding/identity'
}

export default async function OnboardingPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  redirect(getOnboardingTarget(user?.user_metadata?.onboarding_step))
}
