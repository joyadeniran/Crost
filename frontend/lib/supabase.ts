// lib/supabase.ts
// Server-side data/auth facade.
// Database → Supabase Postgres via lib/db.ts (pg over DATABASE_URL)
// Storage  → Supabase Storage via lib/storage.ts
// Auth     → Supabase Auth (cookie session via @supabase/ssr)
// Server-side ONLY.

import { createServerClient } from '@supabase/ssr'
import { createDbClient } from './db'
import { appStorage } from './storage'
import { getSupabaseAdmin } from './supabase-admin'

const authAdmin = {
  async updateUserById(uid: string, updates: { user_metadata?: Record<string, unknown> }) {
    const admin = getSupabaseAdmin()
    if (!updates.user_metadata) return { data: { user: { id: uid } }, error: null }
    // user_metadata is replaced wholesale by Supabase — merge with existing.
    const existing = await admin.auth.admin.getUserById(uid)
    const merged = { ...(existing.data.user?.user_metadata ?? {}), ...updates.user_metadata }
    const { data, error } = await admin.auth.admin.updateUserById(uid, { user_metadata: merged })
    return { data: { user: data?.user ?? { id: uid } }, error }
  },
  async createUser(params: { email: string; password: string }) {
    const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: false,
    })
    return { data: { user: data?.user ? { id: data.user.id, email: data.user.email } : null }, error }
  },
}

// Service-role equivalent: full DB + storage access (no auth check).
export function createServerSupabaseClient() {
  return {
    ...createDbClient(),
    storage: appStorage,
    auth: { admin: authAdmin },
  }
}

// Cookie-based auth client: validates the Supabase session cookie.
export async function createSupabaseServerComponentClient() {
  const { cookies } = await import('next/headers')
  const cookieStore = cookies()

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component — middleware refreshes the session.
          }
        },
      },
    }
  )

  return {
    ...createDbClient(),
    storage: appStorage,
    auth: {
      async getUser() {
        try {
          const { data, error } = await sb.auth.getUser()
          if (error || !data.user) return { data: { user: null }, error: null }
          return { data: { user: data.user }, error: null }
        } catch {
          return { data: { user: null }, error: null }
        }
      },
      async signOut() {
        return sb.auth.signOut()
      },
      admin: { updateUserById: authAdmin.updateUserById },
    },
  }
}
