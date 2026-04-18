import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

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

    const onboardingComplete = user.user_metadata?.onboarding_step === 'complete'

    if (!onboardingComplete) {
      const step = user.user_metadata?.onboarding_step
      let target = '/onboarding/identity'
      if (step === 'activated') target = '/onboarding/activate'
      else if (step === 'team') target = '/onboarding/team'
      else if (step === 'control') target = '/onboarding/control'
      
      if (pathname !== target) {
        return NextResponse.redirect(new URL(target, request.url))
      }
    }
  }

  // Redirect away from Login/Onboarding if complete
  if (pathname === '/login' || pathname.startsWith('/onboarding') || pathname === '/signup') {
    if (user) {
       const onboardingComplete = user.user_metadata?.onboarding_step === 'complete'
       if (onboardingComplete) {
         return NextResponse.redirect(new URL('/dashboard', request.url))
       }
       
       const step = user.user_metadata?.onboarding_step
       let target = '/onboarding/identity'
       if (step === 'activated') target = '/onboarding/activate'
       else if (step === 'team') target = '/onboarding/team'
       else if (step === 'control') target = '/onboarding/control'

       if (pathname.startsWith('/onboarding') && pathname !== target) {
         return NextResponse.redirect(new URL(target, request.url))
       }
    }
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/login'],
}
