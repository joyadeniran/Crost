import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  
  // Use NEXT_PUBLIC_APP_URL if available to avoid internal proxy issues (e.g. localhost:10000 on Render)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin
  const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
  const cookieOptions = isProd ? { domain: '.crosthq.com', path: '/', sameSite: 'lax' as const, secure: true } : {}

  if (code) {
    // Create a temporary response to hold cookies
    const response = NextResponse.redirect(`${baseUrl}/dashboard`) // Default target, will refine below
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            const cookieHeader = request.headers.get('cookie') || ''
            const cookies = cookieHeader.split(';').reduce((acc, c) => {
              const [key, ...val] = c.trim().split('=')
              acc[key] = val.join('=')
              return acc
            }, {} as Record<string, string>)
            return cookies[name]
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set(name, value, { ...options, ...cookieOptions })
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set(name, '', { ...options, ...cookieOptions })
          },
        },
      }
    )
    
    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      const step = data.user.user_metadata?.onboarding_step
      let target = '/onboarding/identity'
      if (step === 'complete') target = '/dashboard'
      else if (step === 'activated') target = '/onboarding/activate'
      else if (step === 'control') target = '/onboarding/control'

      // Return a new redirect to the correct target, but we MUST keep the cookies from the previous response
      const finalResponse = NextResponse.redirect(`${baseUrl}${target}`)
      
      // Copy cookies from our temporary 'response' to 'finalResponse'
      response.cookies.getAll().forEach(cookie => {
        finalResponse.cookies.set(cookie.name, cookie.value, {
          domain: cookie.domain,
          path: cookie.path,
          maxAge: cookie.maxAge,
          secure: cookie.secure,
          sameSite: cookie.sameSite as any,
          httpOnly: cookie.httpOnly,
        })
      })

      return finalResponse
    } else {
      console.error('[Auth Callback] Exchange Error:', error)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${baseUrl}/login?error=auth-callback-failed`)
}
