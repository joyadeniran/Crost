// lib/supabase-admin.ts
// Service-role Supabase client (auth admin + storage). Server-side ONLY.
// Database access goes through lib/db.ts (pg over DATABASE_URL), not this client.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _admin: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (!_admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    }
    _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return _admin
}
