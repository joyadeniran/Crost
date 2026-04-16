import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  
  // Use NEXT_PUBLIC_APP_URL if available to avoid internal proxy issues (e.g. localhost:10000 on Render)
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || origin

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            // Using standard Request headers rather than relying on NextRequest cookies
            // for the edge case of route handlers where we don't have NextRequest
            const cookieHeader = request.headers.get('cookie') || ''
            return cookieHeader.split(';').map(c => {
              const [name, ...rest] = c.trim().split('=')
              return { name, value: rest.join('=') }
            }).filter(c => c.name) // Filter empties
          },
          setAll(cookiesToSet: any[]) {
            // we do the setting below
          },
        },
      }
    )

    // Actually proper setAll needs Response object. Better pattern for Route Handlers:
    const supabaseWithRes = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => {
            const cookieHeader = request.headers.get('cookie') || ''
            return cookieHeader.split(';').map(c => {
              const [name, ...rest] = c.trim().split('=')
              return { name, value: rest.join('=') }
            }).filter(c => c.name)
          },
          setAll: (cookiesToSet: any[]) => {}, // Handled by NextResponse 
        },
      }
    )
    
    // Exchange the code for a session
    const { data, error } = await supabaseWithRes.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      const step = data.user.user_metadata?.onboarding_step
      let target = '/onboarding/identity'
      if (step === 'complete') target = '/dashboard'
      else if (step === 'activated') target = '/onboarding/activate'
      else if (step === 'control') target = '/onboarding/control'

      // Create response and set cookies correctly using Next 13+ route handler pattern
      const response = NextResponse.redirect(`${baseUrl}${target}`)
      
      // We must construct a properly scoped client one more time to inject response cookies
      const finalSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll: () => [],
            setAll: (cookiesToSet: any[]) => {
              cookiesToSet.forEach(({ name, value, options }) => {
                response.cookies.set(name, value, options)
              })
            },
          },
        }
      )
      
      // trigger token refresh / cookie set
      await finalSupabase.auth.getUser()
      
      return response
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${baseUrl}/login?error=auth-callback-failed`)
}
