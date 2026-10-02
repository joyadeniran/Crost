// middleware.ts — Supabase Auth session refresh + route protection.

import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const ONBOARDING_ROUTES = [
  '/app/onboarding/identity',
  '/app/onboarding/orc',
  '/app/onboarding/activate',
]

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/app'
  if (step === 'activated') return '/app/onboarding/activate'
  if (step === 'orc') return '/app/onboarding/orc'
  return '/app/onboarding/identity'
}

function getRouteRank(pathname: string) {
  return ONBOARDING_ROUTES.findIndex((route) => pathname.startsWith(route))
}

// ─── CSRF: origin-check for state-changing API requests ────────────────────
// Defense in depth on top of SameSite=Lax session cookies.
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isTrustedOrigin(selfOrigin: string, origin: string | null): boolean {
  // No Origin header: not a browser cross-site request (webhook, cron, server-to-server).
  if (!origin) return true
  const normalized = origin.replace(/\/$/, '')
  if (normalized === selfOrigin.replace(/\/$/, '')) return true
  const allowlist = [process.env.NEXT_PUBLIC_APP_URL, 'https://crosthq.com', 'https://www.crosthq.com']
    .filter((u): u is string => Boolean(u))
    .map((u) => u.replace(/\/$/, ''))
  return allowlist.includes(normalized)
}

export function checkInternalSecretHeader(headerValue: string | null): boolean {
  const configuredSecret = process.env.WORKER_INTERNAL_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  return Boolean(headerValue && configuredSecret && headerValue === configuredSecret)
}

function checkCsrf(request: NextRequest): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith('/api/')) return null
  if (!STATE_CHANGING_METHODS.has(request.method)) return null
  if (checkInternalSecretHeader(request.headers.get('x-crost-internal-secret'))) return null

  const origin = request.headers.get('origin')
  if (!isTrustedOrigin(request.nextUrl.origin, origin)) {
    return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
  }
  return null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const csrfBlock = checkCsrf(request)
  if (csrfBlock) return csrfBlock

  // API routes do their own auth (lib/auth/guard.ts).
  if (pathname.startsWith('/api/')) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // getUser() validates the JWT with Supabase Auth and refreshes the cookie.
  const { data } = await supabase.auth.getUser()
  const user = data.user

  const redirectTo = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  // Protected: the whole app requires a valid session.
  if (pathname.startsWith('/app')) {
    if (!user) return redirectTo('/login')

    const step = (user.user_metadata?.onboarding_step as string | undefined) ?? null
    const target = getOnboardingTarget(step)
    if (pathname.startsWith('/app/onboarding')) {
      const requestedRank = getRouteRank(pathname)
      const maxAllowedRank = getRouteRank(target)
      if (target === '/app' || requestedRank > maxAllowedRank) return redirectTo(target)
    } else if (step !== 'complete') {
      return redirectTo(target)
    }
  }

  // Signed-in users skip login/signup.
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const step = (user.user_metadata?.onboarding_step as string | undefined) ?? null
    return redirectTo(getOnboardingTarget(step))
  }

  return response
}

export const config = {
  matcher: ['/app/:path*', '/login', '/signup', '/api/:path*'],
}
