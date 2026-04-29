import { NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

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
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin

  if (code) {
    // Create a temporary response to hold headers
    const response = new NextResponse()
    
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
            const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
            const prodDomain = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : undefined
            const domainOptions = isProd ? { domain: prodDomain } : {}
            response.cookies.set({ name, value, ...options, ...domainOptions })
          },
          remove(name: string, options: CookieOptions) {
            const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
            const prodDomain = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : undefined
            const domainOptions = isProd ? { domain: prodDomain } : {}
            response.cookies.delete({ name, ...options, ...domainOptions })
          },
        },
      }
    )
    
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      const step = data.user.user_metadata?.onboarding_step
      const target = getOnboardingTarget(step)
      
      const finalResponse = NextResponse.redirect(`${baseUrl}${target}`)
      
      // Transfer the cookies from the helper response to the redirect response
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          finalResponse.headers.append(key, value)
        }
      })

      return finalResponse
    } else {
      console.error('[Auth Callback] Exchange Error:', error)
    }
  }

  return NextResponse.redirect(`${baseUrl}/login?error=auth-callback-failed`)
}
