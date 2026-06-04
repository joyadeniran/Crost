// lib/firebase-browser.ts
// Firebase browser SDK — client-side auth.
// Replaces @supabase/supabase-js browser client.
// Client-side ONLY ('use client').

import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const auth = getAuth(app)

const isProd = process.env.NEXT_PUBLIC_APP_URL?.includes('crosthq.com')

// Sets the firebase-token cookie so Next.js middleware can verify auth server-side.
export async function refreshTokenCookie(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) {
    document.cookie = 'firebase-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    return null
  }
  const token = await user.getIdToken(true)
  const secure = isProd ? '; secure' : ''
  document.cookie = `firebase-token=${token}; path=/; max-age=3600; samesite=lax${secure}`
  return token
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  firebaseSignOut as signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
}
