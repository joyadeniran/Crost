// lib/supabase-browser.ts
// Browser-only Supabase client — lazy singleton.
// Import ONLY from client components ('use client'), never from API routes or server components.

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')
    const prodDomain = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname : undefined
    const cookieOptions = isProd ? { domain: prodDomain, path: '/', sameSite: 'lax' as const, secure: true } : {}

    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions,
        global: {
          fetch: (url: RequestInfo | URL, options?: RequestInit) =>
            fetch(url, { ...options, cache: 'no-store' as RequestCache }),
        },
      }
    )
  }
  return _client
}

// Named export matching old import style — resolved lazily at call time, not module load time.
export const supabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseClient() as any)[prop]
  },
})
