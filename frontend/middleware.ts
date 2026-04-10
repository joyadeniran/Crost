import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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
            response.cookies.set(name, value, options)
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
      return NextResponse.redirect(new URL(step === 'activated' ? '/onboarding/activate' : '/onboarding/identity', request.url))
    }
  }

  // Redirect away from Login/Onboarding if complete
  if (pathname === '/login' || pathname.startsWith('/onboarding') || pathname === '/signup') {
    if (user) {
       const onboardingComplete = user.user_metadata?.onboarding_step === 'complete'
       if (onboardingComplete) {
         return NextResponse.redirect(new URL('/dashboard', request.url))
       }
       
       // If they are on the earlier onboarding pages but are already 'activated', push them to activation
       if (pathname !== '/onboarding/activate' && user.user_metadata?.onboarding_step === 'activated' && pathname.startsWith('/onboarding')) {
         return NextResponse.redirect(new URL('/onboarding/activate', request.url))
       }
    }
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*', '/login'],
}
