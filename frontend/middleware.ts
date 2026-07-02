// middleware.ts — Firebase JWT auth for Next.js App Router
// Uses jose to verify Firebase ID tokens in edge runtime (no firebase-admin needed).

import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify, createRemoteJWKSet } from 'jose'

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? ''
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
)

const ONBOARDING_ROUTES = [
  '/onboarding/identity',
  '/onboarding/control',
  '/onboarding/orc',
  '/onboarding/team',
  '/onboarding/activate',
]

function getOnboardingTarget(step?: string | null) {
  if (step === 'complete') return '/dashboard'
  if (step === 'activated') return '/onboarding/activate'
  if (step === 'team') return '/onboarding/team'
  if (step === 'orc') return '/onboarding/orc'
  if (step === 'control') return '/onboarding/control'
  return '/onboarding/identity'
}

function getRouteRank(pathname: string) {
  return ONBOARDING_ROUTES.findIndex((route) => pathname.startsWith(route))
}

// ─── CSRF: origin-check for state-changing API requests (Phase 4) ─────────
// SameSite=Lax on the firebase-token cookie (lib/firebase-browser.ts) already
// blocks the cookie from being sent on cross-site top-level navigations, but
// doesn't cover every CSRF vector (e.g. same-site subdomain attacks, or
// browsers with looser SameSite handling). This adds an explicit
// Origin-header allowlist check as defense in depth, matching the pattern
// already used for OAuth redirect URIs (lib/google/oauth.ts allowedOrigins).
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isTrustedOrigin(selfOrigin: string, origin: string | null): boolean {
  // No Origin header at all: not a browser cross-site request signal (fetch()
  // and form submissions from a browser always send Origin on state-changing
  // requests; its absence means a non-browser caller — e.g. a webhook or a
  // server-to-server call — which Origin-based CSRF checks don't apply to).
  if (!origin) return true
  const normalized = origin.replace(/\/$/, '')
  if (normalized === selfOrigin.replace(/\/$/, '')) return true
  const allowlist = [process.env.NEXT_PUBLIC_APP_URL, 'https://app.crosthq.com']
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

  // Trusted server-to-server callers (worker execution, chain-reaction
  // recursive dispatch, cron) carry this header and typically don't send a
  // browser Origin header at all — always allowed regardless of Origin.
  if (checkInternalSecretHeader(request.headers.get('x-crost-internal-secret'))) return null

  const origin = request.headers.get('origin')
  if (!isTrustedOrigin(request.nextUrl.origin, origin)) {
    return NextResponse.json({ error: 'Cross-origin request blocked' }, { status: 403 })
  }
  return null
}

async function verifyToken(token: string): Promise<Record<string, unknown> | null> {
  if (!FIREBASE_PROJECT_ID) return null
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      audience: FIREBASE_PROJECT_ID,
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    })
    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const csrfBlock = checkCsrf(request)
  if (csrfBlock) return csrfBlock

  // API routes do their own auth (createSupabaseServerComponentClient /
  // lib/auth/guard.ts) — nothing below this point reads `user` for an
  // /api/* path, so skip the redundant Firebase JWKS verification round-trip.
  if (pathname.startsWith('/api/')) return NextResponse.next()

  const token = request.cookies.get('firebase-token')?.value

  let user: Record<string, unknown> | null = null
  if (token) user = await verifyToken(token)

  const response = NextResponse.next()

  // Protected: Dashboard requires valid auth
  if (pathname.startsWith('/dashboard')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
  }

  // Block unverified email users
  if (user && user.email_verified === false) {
    const allowed = pathname === '/login' || pathname === '/signup' ||
                    pathname === '/verify-email' || pathname.startsWith('/auth')
    if (!allowed) {
      const url = new URL('/verify-email', request.url)
      if (user.email) url.searchParams.set('email', user.email as string)
      return NextResponse.redirect(url)
    }
    return response
  }

  // Redirect authenticated users away from login/signup/onboarding when done
  if (pathname === '/login' || pathname.startsWith('/onboarding') || pathname === '/signup') {
    if (user) {
      const step = (user.onboarding_step as string) ?? null
      const target = getOnboardingTarget(step)

      if (pathname === '/login' || pathname === '/signup') {
        return NextResponse.redirect(new URL(target, request.url))
      }

      if (pathname.startsWith('/onboarding')) {
        const requestedRank = getRouteRank(pathname)
        const maxAllowedRank = getRouteRank(target)
        if (requestedRank > maxAllowedRank) {
          return NextResponse.redirect(new URL(target, request.url))
        }
      }
    }
  }

  return response
}

export const config = {
  // /api/:path* added in Phase 4 so the CSRF origin-check above actually runs
  // for API routes — previously the matcher only covered page routes, so
  // state-changing API requests were never touched by this middleware at all.
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/login', '/signup', '/api/:path*'],
}
