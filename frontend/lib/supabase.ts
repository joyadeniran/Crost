// lib/supabase.ts
// Supabase client setup.
// Client-side uses anon key. Server-side uses service role key (never exposed to browser).

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createServerClient, createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Validate client-side env vars (throw at startup if missing)
if (!supabaseUrl) {
  throw new Error('[Crost] NEXT_PUBLIC_SUPABASE_URL is not set. Check your .env.local file.')
}
if (!supabaseAnonKey) {
  throw new Error('[Crost] NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Check your .env.local file.')
}

// Client-side Supabase client (uses anon key, automatically syncs auth with cookies for SSR)
export const supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: (url: RequestInfo | URL, options?: RequestInit) => fetch(url, { ...options, cache: 'no-store' as RequestCache }) }
})

// Server-side Supabase client (uses service role key, bypasses RLS)
// ONLY use in API routes and server components — never expose to the browser
export function createServerSupabaseClient() {
  if (!supabaseServiceKey) {
    throw new Error('[Crost] SUPABASE_SERVICE_ROLE_KEY is not set. Required for server-side operations.')
  }
  return createClient(supabaseUrl!, supabaseServiceKey, {
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
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
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
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  await supabase.auth.getUser()

  return response
}
