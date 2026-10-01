'use client'
// lib/refresh-token.ts
// Refreshes the Supabase session so updated user_metadata (e.g.
// onboarding_step) is reflected in the JWT/cookie before navigation.
// Call this after any API that updates user metadata.

import { supabaseClient } from './supabase-browser'

export async function refreshTokenAfterStep(): Promise<void> {
  await supabaseClient.auth.refreshSession()
}
