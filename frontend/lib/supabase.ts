// lib/supabase.ts
// Server-side Supabase clients ONLY.
// For client components, import from '@/lib/supabase-browser' instead.

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Server-side Supabase client (uses service role key, bypasses RLS)
// ONLY use in API routes and server components — never expose to the browser
export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('[Crost] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. Required for server-side operations.')
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: (url: RequestInfo | URL, options?: RequestInit) => fetch(url, { ...options, cache: 'no-store' as RequestCache })
    }
  })
}

// Server component client with cookie-based auth (for authenticated routes)
export async function createSupabaseServerComponentClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('[Crost] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.')
  }

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            // eslint-disable-next-line
            cookieStore.set(name, value, options as never)
          )
        } catch {
          // Server component — can't set cookies. Middleware handles refresh.
        }
      },
    },
    global: {
      fetch: (url: RequestInfo | URL, options?: RequestInit) => fetch(url, { ...options, cache: 'no-store' as RequestCache })
    }
  })
}
// Middleware client for refreshing sessions
export async function updateSession(request: any) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
  const cookieOptions = isProd ? { domain: '.crosthq.com', path: '/', sameSite: 'lax', secure: true } : {}

  const supabase = createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
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
  })

  await supabase.auth.getUser()

  return response
}
