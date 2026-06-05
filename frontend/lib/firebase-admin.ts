// lib/firebase-admin.ts
// Firebase Admin SDK — server-side auth.
// On Cloud Run: uses Application Default Credentials (no JSON key needed).
// Locally: uses FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL.
// Server-side ONLY.

import admin from 'firebase-admin'

function initAdmin() {
  if (admin.apps.length) return
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const hasExplicitCreds = process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && privateKey
  if (hasExplicitCreds) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      } as admin.ServiceAccount),
    })
  } else {
    admin.initializeApp() // Cloud Run: uses Application Default Credentials
  }
}

// Maps Firebase decoded token to Supabase user shape for backwards compatibility.
// All existing code that reads user.id, user.email, user.user_metadata.onboarding_step continues to work.
function mapToSupabaseUser(decoded: admin.auth.DecodedIdToken) {
  return {
    id: decoded.uid,
    email: decoded.email ?? null,
    email_confirmed_at: decoded.email_verified ? new Date().toISOString() : null,
    user_metadata: {
      onboarding_step: (decoded as any).onboarding_step ?? null,
      local_identity: (decoded as any).local_identity ?? null,
      full_name: decoded.name ?? null,
    },
    app_metadata: {
      provider: (decoded.firebase as any)?.sign_in_provider ?? 'email',
    },
    created_at: new Date((decoded.iat ?? 0) * 1000).toISOString(),
  }
}

export async function getFirebaseUser(token: string) {
  initAdmin()
  const decoded = await admin.auth().verifyIdToken(token, true)
  return mapToSupabaseUser(decoded)
}

export async function setUserClaims(uid: string, claims: Record<string, unknown>) {
  initAdmin()
  const existing = (await admin.auth().getUser(uid)).customClaims ?? {}
  await admin.auth().setCustomUserClaims(uid, { ...existing, ...claims })
}

export async function createFirebaseUser(email: string, password: string) {
  initAdmin()
  return admin.auth().createUser({ email, password, emailVerified: false })
}

export async function getUserByEmail(email: string) {
  initAdmin()
  try { return await admin.auth().getUserByEmail(email) } catch { return null }
}

export async function sendVerificationEmail(uid: string, redirectUrl: string) {
  initAdmin()
  return admin.auth().generateEmailVerificationLink(
    (await admin.auth().getUser(uid)).email!,
    { url: redirectUrl }
  )
}

export { admin }
