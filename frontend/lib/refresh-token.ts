'use client'
// lib/refresh-token.ts
// Force-refreshes the Firebase ID token so new custom claims
// (e.g. onboarding_step) are reflected in the cookie before navigation.
// Call this after any API that updates Firebase custom claims.

import { auth, refreshTokenCookie } from './firebase-browser'

export async function refreshTokenAfterStep(): Promise<void> {
  const user = auth.currentUser
  if (!user) return
  // force=true fetches a fresh token from Firebase with updated custom claims
  await user.getIdToken(true)
  await refreshTokenCookie()
}
