// lib/supabase-browser.ts
// Browser auth client (Supabase Auth via @supabase/ssr — cookie session).
// Table access from the browser is intentionally a no-op: every table has RLS
// enabled with no policies, and all data flows through /api routes.
// Client-side ONLY ('use client').

import { createBrowserClient } from '@supabase/ssr'

let _sb: ReturnType<typeof createBrowserClient> | null = null

function sb() {
  if (!_sb) {
    _sb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    )
  }
  return _sb
}

function makeQueryBuilder(): any {
  const qb: any = {
    select() { return qb },
    eq() { return qb },
    neq() { return qb },
    lt() { return qb },
    lte() { return qb },
    gt() { return qb },
    gte() { return qb },
    in() { return qb },
    is() { return qb },
    not() { return qb },
    or() { return qb },
    ilike() { return qb },
    like() { return qb },
    order() { return qb },
    limit() { return qb },
    single() { return Promise.resolve({ data: null, error: null }) },
    maybeSingle() { return Promise.resolve({ data: null, error: null }) },
    insert() { return Promise.resolve({ data: null, error: null }) },
    update() { return qb },
    upsert() { return Promise.resolve({ data: null, error: null }) },
    delete() { return qb },
    then(resolve: any, reject: any) {
      return Promise.resolve({ data: [] as any[], error: null }).then(resolve, reject)
    },
  }
  return qb
}

function makeChannel(): any {
  const ch: any = {
    on() { return ch },
    subscribe() { return ch },
  }
  return ch
}

export const supabaseClient = {
  auth: {
    signInWithPassword: (creds: { email: string; password: string }) => sb().auth.signInWithPassword(creds),
    signInWithOtp: (params: { email: string; options?: { emailRedirectTo?: string } }) =>
      sb().auth.signInWithOtp(params),
    verifyOtp: (params: any) => sb().auth.verifyOtp(params),
    signUp: (params: any) => sb().auth.signUp(params),
    signOut: () => sb().auth.signOut(),
    getUser: () => sb().auth.getUser(),
    getSession: () => sb().auth.getSession(),
    refreshSession: () => sb().auth.refreshSession(),
    signInWithOAuth: (params: any) => sb().auth.signInWithOAuth(params),
    onAuthStateChange: (cb: (event: string, session: any) => void) => sb().auth.onAuthStateChange(cb),
  },
  from: (_table: string) => makeQueryBuilder(),
  rpc: async (_fn: string, _params?: Record<string, unknown>) => ({ data: null, error: null }),
  channel: (_name: string) => makeChannel(),
  removeChannel: (_channel: any) => {},
}

export function getSupabaseClient() {
  return supabaseClient
}
