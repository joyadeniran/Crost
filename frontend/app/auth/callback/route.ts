// app/auth/callback/route.ts
// Supabase Auth callback: exchanges the OAuth / magic-link `code` for a session
// cookie, then forwards the user to the right destination.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/app'
  if (step === 'activated') return '/app/onboarding/activate'
  if (step === 'orc') return '/app/onboarding/orc'
  return '/app/onboarding/identity'
}

// Only same-site relative paths — never an open redirect.
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin

  if (!code) return NextResponse.redirect(`${baseUrl}/login?error=missing_code`)

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) return NextResponse.redirect(`${baseUrl}/login?error=auth_failed`)

  const target = getOnboardingTarget(data.user.user_metadata?.onboarding_step as string | undefined)
  return NextResponse.redirect(`${baseUrl}${target === '/app' ? (next ?? '/app') : target}`)
}
