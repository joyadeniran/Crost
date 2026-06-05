// lib/supabase-browser.ts
// Firebase Auth compatibility shim — replaces @supabase/supabase-js browser client.
// Provides supabaseClient.auth.* interface used by login/signup/dashboard pages.
// Client-side ONLY ('use client').

import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  refreshTokenCookie,
} from './firebase-browser'

const supabaseCompatAuth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      await refreshTokenCookie()
      return { data: { user: cred.user, session: {} }, error: null }
    } catch (err: any) {
      return { data: { user: null, session: null }, error: { message: err.message } }
    }
  },

  async signInWithOtp({ email, options }: { email: string; options?: { emailRedirectTo?: string } }) {
    try {
      const redirectUrl = options?.emailRedirectTo ?? `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard`
      await sendSignInLinkToEmail(auth, email, {
        url: redirectUrl,
        handleCodeInApp: true,
      })
      if (typeof window !== 'undefined') window.localStorage.setItem('emailForSignIn', email)
      return { data: {}, error: null }
    } catch (err: any) {
      return { data: null, error: { message: err.message } }
    }
  },

  async verifyOtp({ email, token: _token, type: _type }: { email?: string; token: string; type: string }) {
    if (typeof window === 'undefined') return { data: null, error: { message: 'Client-side only' } }
    if (isSignInWithEmailLink(auth, window.location.href)) {
      try {
        const emailToUse = email ?? window.localStorage.getItem('emailForSignIn') ?? ''
        const cred = await signInWithEmailLink(auth, emailToUse, window.location.href)
        await refreshTokenCookie()
        window.localStorage.removeItem('emailForSignIn')
        return { data: { user: cred.user }, error: null }
      } catch (err: any) {
        return { data: null, error: { message: err.message } }
      }
    }
    return { data: null, error: { message: 'Invalid sign-in link' } }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: any }) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      const redirectUrl = options?.emailRedirectUrl ?? `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard`
      await sendEmailVerification(cred.user, { url: redirectUrl })
      return { data: { user: cred.user, session: null }, error: null }
    } catch (err: any) {
      return { data: null, error: { message: err.message } }
    }
  },

  async signOut() {
    try {
      await signOut(auth)
      if (typeof document !== 'undefined') {
        document.cookie = 'firebase-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      }
      return { error: null }
    } catch (err: any) {
      return { error: { message: err.message } }
    }
  },

  async getUser() {
    return { data: { user: auth.currentUser }, error: null }
  },

  async getSession() {
    const user = auth.currentUser
    if (!user) return { data: { session: null }, error: null }
    const token = await user.getIdToken()
    return { data: { session: { access_token: token, user } }, error: null }
  },

  async signInWithOAuth({ provider, options }: { provider: string; options?: { redirectTo?: string } }) {
    try {
      const { GoogleAuthProvider, signInWithPopup } = await import('./firebase-browser')
      if (provider === 'google') {
        const googleProvider = new GoogleAuthProvider()
        const cred = await signInWithPopup(auth, googleProvider)
        await refreshTokenCookie()
        // Always go to /dashboard after OAuth — ignore the Supabase-era /auth/callback
        if (typeof window !== 'undefined') window.location.href = `${window.location.origin}/dashboard`
        return { data: { user: cred.user }, error: null }
      }
      return { data: null, error: { message: `Provider ${provider} not supported` } }
    } catch (err: any) {
      return { data: null, error: { message: err.message } }
    }
  },

  async refreshSession() {
    await refreshTokenCookie()
    return { data: { session: null }, error: null }
  },

  onAuthStateChange(callback: (event: string, session: any) => void) {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await refreshTokenCookie()
        callback('SIGNED_IN', { user })
      } else {
        callback('SIGNED_OUT', null)
      }
    })
    return { data: { subscription: { unsubscribe } } }
  },
}

export const supabaseClient = {
  auth: supabaseCompatAuth,
  // DB methods are server-side only; stubs prevent import errors in client components
  from: () => ({ select: () => ({ data: null, error: null }) }),
  rpc: async (_fn: string, _params?: Record<string, unknown>) => ({ data: null, error: null }),
}

export function getSupabaseClient() {
  return supabaseClient
}
