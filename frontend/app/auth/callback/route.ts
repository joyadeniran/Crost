// app/auth/callback/route.ts
// Firebase Auth callback handler.
// Firebase signInWithPopup completes client-side; this route just catches
// any server-side redirects and sends them to the right destination.

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/dashboard'
  if (step === 'activated') return '/onboarding/activate'
  if (step === 'team') return '/onboarding/team'
  if (step === 'orc') return '/onboarding/orc'
  if (step === 'control') return '/onboarding/control'
  return '/onboarding/identity'
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/dashboard'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin

  // Firebase auth is handled client-side via signInWithPopup.
  // This route exists to catch any redirect-based flows and forward
  // the user to the right place. The middleware will verify the
  // firebase-token cookie and redirect if onboarding isn't complete.
  return NextResponse.redirect(`${baseUrl}${next}`)
}
