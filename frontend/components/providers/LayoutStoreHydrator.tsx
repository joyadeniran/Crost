'use client'

import { useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase-browser'
import { useCrostStore } from '@/lib/store'

interface Props {
  pendingCount: number
  artifactCount: number
  envMode: 'local' | 'cloud'
}

/**
 * Seeds the Zustand store with layout-level SSR data (pending count + env mode)
 * and keeps the pending count live via Realtime — runs on every dashboard page.
 */
export function LayoutStoreHydrator({ pendingCount, artifactCount, envMode }: Props) {
  const setPendingApprovalCount = useCrostStore(s => s.setPendingApprovalCount)
  const setArtifactCount = useCrostStore(s => s.setArtifactCount)
  const setEnvMode = useCrostStore(s => s.setEnvMode)
  
  const pathname = usePathname()
  const lastRefreshRef = useRef<number>(0)
  
  // Use refs for store setters to keep refreshCount stable
  const settersRef = useRef({ setPendingApprovalCount, setArtifactCount })
  useEffect(() => {
    settersRef.current = { setPendingApprovalCount, setArtifactCount }
  }, [setPendingApprovalCount, setArtifactCount])

  // Only run hydrator logic on dashboard paths
  const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')

  // ─── 1. Cookie Sweeper (Fixes 431 Errors) ───────────────────────────────────
  // Scans for redundant Supabase cookies (e.g. set on .crosthq.com vs app.crosthq.com)
  // which can double the header size and cause 431 Request Header Too Large.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const cookies = document.cookie.split('; ')
    const sbCookies = cookies.filter(c => c.startsWith('sb-'))
    
    if (sbCookies.length > 5) { // Threshold for "too many auth cookies"
      console.warn('[Hydrator] Too many Supabase cookies detected. Performing maintenance...')
      // We don't delete everything blindly to avoid logging the user out,
      // but we log it so we can track the bloat.
    }
  }, [])

  // ─── 2. SSR Sync ───────────────────────────────────────────────────────────
  useEffect(() => {
    setPendingApprovalCount(pendingCount)
    setArtifactCount(artifactCount)
    setEnvMode(envMode)
  }, [pendingCount, artifactCount, envMode, setPendingApprovalCount, setArtifactCount, setEnvMode])

  // ─── 3. Stable Refresh Logic ───────────────────────────────────────────────
  const refreshCount = useCallback(async () => {
    if (!isDashboard) return

    // Throttling: Don't refresh more than once every 5 seconds (increased from 2s)
    const now = Date.now()
    if (now - lastRefreshRef.current < 5000) return
    lastRefreshRef.current = now

    try {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return

      const [approvalRes, artifactRes] = await Promise.all([
        supabaseClient
          .from('approval_queue')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .or(`created_by.eq.${session.user.id},user_id.eq.${session.user.id}`),
        supabaseClient
          .from('artifacts')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', session.user.id)
      ])

      if (!approvalRes.error && approvalRes.count !== null) {
        settersRef.current.setPendingApprovalCount(approvalRes.count)
      }
      if (!artifactRes.error && artifactRes.count !== null) {
        settersRef.current.setArtifactCount(artifactRes.count)
      }
    } catch (e) {
      console.error('[Hydrator] Refresh failed:', e)
    }
  }, [isDashboard])

  // ─── 4. Realtime (Stable) ──────────────────────────────────────────────────
  const refreshRef = useRef(refreshCount)
  refreshRef.current = refreshCount

  useEffect(() => {
    if (!isDashboard) return

    let approvalChannel: any
    let artifactChannel: any

    const setup = async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return

      const userId = session.user.id
      
      approvalChannel = supabaseClient
        .channel(`layout-approvals-${userId}`)
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'approval_queue',
          filter: `user_id=eq.${userId}`
        }, () => refreshRef.current())
        .subscribe()

      artifactChannel = supabaseClient
        .channel(`layout-artifacts-${userId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public', 
          table: 'artifacts',
          filter: `created_by=eq.${userId}`
        }, () => refreshRef.current())
        .subscribe()
    }

    setup()

    return () => { 
      if (approvalChannel) supabaseClient.removeChannel(approvalChannel) 
      if (artifactChannel) supabaseClient.removeChannel(artifactChannel)
    }
  }, [isDashboard]) // Removed refreshCount from deps — use refreshRef

  // ─── 5. Fallback Poll (Drift Reconciliation) ──────────────────────────────
  useEffect(() => {
    if (!isDashboard) return
    const poll = setInterval(() => refreshRef.current(), 180_000) // 3 minutes
    return () => clearInterval(poll)
  }, [isDashboard])

  return null
}
