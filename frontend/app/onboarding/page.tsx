import { redirect } from 'next/navigation'
import { createSupabaseServerComponentClient } from '@/lib/supabase'

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/dashboard'
  if (step === 'activated') return '/onboarding/activate'
  if (step === 'team') return '/onboarding/team'
  if (step === 'orc') return '/onboarding/orc'
  if (step === 'control') return '/onboarding/control'
  return '/onboarding/identity'
}

export default async function OnboardingPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  redirect(getOnboardingTarget(user?.user_metadata?.onboarding_step))
}
