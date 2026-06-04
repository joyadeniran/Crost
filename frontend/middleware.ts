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
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/login', '/signup'],
}
