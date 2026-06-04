// lib/supabase.ts
// GCP migration compatibility shim.
// Provides the same export interface as the old @supabase/supabase-js server client.
// Database → Cloud SQL via lib/db.ts
// Storage  → GCS via lib/gcs.ts
// Auth     → Firebase Admin via lib/firebase-admin.ts
// Server-side ONLY.

import { createDbClient } from './db'
import { gcsStorage } from './gcs'
import { getFirebaseUser, setUserClaims, admin } from './firebase-admin'

// Service-role equivalent: full DB + GCS access (no auth check).
// Drop-in replacement for createServerSupabaseClient().
export function createServerSupabaseClient() {
  const db = createDbClient()
  return {
    ...db,
    storage: gcsStorage,
    auth: {
      admin: {
        async updateUserById(uid: string, updates: { user_metadata?: Record<string, unknown> }) {
          if (updates.user_metadata) {
            await setUserClaims(uid, updates.user_metadata)
          }
          return { data: { user: { id: uid } }, error: null }
        },
        async createUser(params: { email: string; password: string }) {
          const { createFirebaseUser } = await import('./firebase-admin')
          const user = await createFirebaseUser(params.email, params.password)
          return { data: { user: { id: user.uid, email: user.email } }, error: null }
        },
      },
    },
  }
}

// Cookie-based auth client: reads firebase-token cookie and verifies it.
// Drop-in replacement for createSupabaseServerComponentClient().
export async function createSupabaseServerComponentClient() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const token = cookieStore.get('firebase-token')?.value ?? null

  const db = createDbClient()

  return {
    ...db,
    storage: gcsStorage,
    auth: {
      async getUser() {
        if (!token) return { data: { user: null }, error: null }
        try {
          const user = await getFirebaseUser(token)
          return { data: { user }, error: null }
        } catch {
          return { data: { user: null }, error: null }
        }
      },
      async signOut() {
        return { error: null }
      },
      admin: {
        async updateUserById(uid: string, updates: { user_metadata?: Record<string, unknown> }) {
          if (updates.user_metadata) {
            await setUserClaims(uid, updates.user_metadata)
          }
          return { data: { user: { id: uid } }, error: null }
        },
      },
    },
  }
}

// No-op — middleware now uses Firebase JWT verification directly.
export async function updateSession(_request: unknown) {
  const { NextResponse } = await import('next/server')
  return NextResponse.next()
}
