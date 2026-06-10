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

function mapFirebaseUser(user: any) {
  if (!user) return null
  return new Proxy(user, {
    get(target: any, prop: string | symbol) {
      if (prop === 'id') return target.uid
      return typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]
    }
  })
}

function makeQueryBuilder(): any {
  const qb: any = {
    select(_cols?: string, _opts?: any) { return qb },
    eq(_col: string, _val: any) { return qb },
    neq(_col: string, _val: any) { return qb },
    lt(_col: string, _val: any) { return qb },
    lte(_col: string, _val: any) { return qb },
    gt(_col: string, _val: any) { return qb },
    gte(_col: string, _val: any) { return qb },
    in(_col: string, _vals: any[]) { return qb },
    is(_col: string, _val: any) { return qb },
    not(_col: string, _op: string, _val: any) { return qb },
    or(_filter: string) { return qb },
    ilike(_col: string, _pattern: string) { return qb },
    like(_col: string, _pattern: string) { return qb },
    order(_col: string, _opts?: any) { return qb },
    limit(_n: number) { return qb },
    single() { return Promise.resolve({ data: null, error: null }) },
    maybeSingle() { return Promise.resolve({ data: null, error: null }) },
    insert(_data: any) { return Promise.resolve({ data: null, error: null }) },
    update(_data: any) { return qb },
    upsert(_data: any, _opts?: any) { return Promise.resolve({ data: null, error: null }) },
    delete() { return qb },
    then(resolve: any, reject: any) {
      return Promise.resolve({ data: [] as any[], error: null }).then(resolve, reject)
    },
  }
  return qb
}

function makeChannel(_name: string): any {
  const ch: any = {
    on(_event: string, _filter: any, _callback?: any) { return ch },
    subscribe(_callback?: any) { return ch },
  }
  return ch
}

const supabaseCompatAuth = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password)
      await refreshTokenCookie()
      return { data: { user: mapFirebaseUser(cred.user), session: {} }, error: null }
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
        return { data: { user: mapFirebaseUser(cred.user) }, error: null }
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
      return { data: { user: mapFirebaseUser(cred.user), session: null }, error: null }
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
        return { data: { user: mapFirebaseUser(cred.user) }, error: null }
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
  auth: {
    ...supabaseCompatAuth,
    async getUser() {
      return { data: { user: mapFirebaseUser(auth.currentUser) }, error: null }
    },
    onAuthStateChange(callback: (event: string, session: any) => void) {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          await refreshTokenCookie()
          callback('SIGNED_IN', { user: mapFirebaseUser(user) })
        } else {
          callback('SIGNED_OUT', null)
        }
      })
      return { data: { subscription: { unsubscribe } } }
    },
  },
  from: (_table: string) => makeQueryBuilder(),
  rpc: async (_fn: string, _params?: Record<string, unknown>) => ({ data: null, error: null }),
  channel: (name: string) => makeChannel(name),
  removeChannel: (_channel: any) => {},
}

export function getSupabaseClient() {
  return supabaseClient
}
