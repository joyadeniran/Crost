import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
  const cookieOptions = isProd ? { domain: '.crosthq.com', path: '/', sameSite: 'lax' as const, secure: true } : {}

  // Use the public anon key for middleware (browser context)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, { ...options, ...cookieOptions })
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // Protected: Dashboard
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // Redirect away from Login/Onboarding if complete
  if (pathname === '/login' || pathname.startsWith('/onboarding') || pathname === '/signup') {
    if (user) {
       const step = user.user_metadata?.onboarding_step
       const onboardingComplete = step === 'complete'
       if (onboardingComplete) {
         return NextResponse.redirect(new URL('/dashboard', request.url))
       }

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
