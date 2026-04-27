'use client'

import { useCallback, useEffect } from 'react'
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
  const { setPendingApprovalCount, setArtifactCount, setEnvMode } = useCrostStore()
  const pathname = usePathname()

  // Only run hydrator logic on dashboard paths
  const isDashboard = pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')

  // Seed from server data
  useEffect(() => {
    setPendingApprovalCount(pendingCount)
    setArtifactCount(artifactCount)
    setEnvMode(envMode)
  }, [pendingCount, artifactCount, envMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshCount = useCallback(async () => {
    if (!isDashboard) return

    // Get session to filter by user ID (prevents wide scans and timeouts)
    const { data: { session } } = await supabaseClient.auth.getSession()
    if (!session?.user) return

    const [approvalRes, artifactRes] = await Promise.all([
      supabaseClient
        .from('approval_queue')
        .select('id')
        .eq('status', 'pending')
        .or(`created_by.eq.${session.user.id},user_id.eq.${session.user.id}`),
      supabaseClient
        .from('artifacts')
        .select('id, title, body')
        .eq('created_by', session.user.id)
        .limit(500)
    ])

    if (!approvalRes.error) {
      setPendingApprovalCount(approvalRes.data?.length ?? 0)
    }
    if (!artifactRes.error) {
      // Filter out failed tool executions to match layout.tsx logic
      const count = (artifactRes.data ?? []).filter(
        (a: any) => !a.body?.startsWith('[TOOL EXECUTION FAILED') && !a.title?.startsWith('[TOOL EXECUTION FAILED')
      ).length
      setArtifactCount(count)
    }
  }, [setPendingApprovalCount, setArtifactCount, isDashboard])

  // Realtime subscription — re-fetch on any change instead of optimistic
  // increment/decrement. This avoids cross-user count contamination.
  useEffect(() => {
    if (!isDashboard) return

    let approvalChannel: any;
    let artifactChannel: any;

    ;(async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return

      approvalChannel = supabaseClient
        .channel('layout-approvals-realtime')
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'approval_queue',
            filter: `user_id=eq.${session.user.id}`
          },
          () => refreshCount()
        )
        .subscribe()

      artifactChannel = supabaseClient
        .channel('layout-artifacts-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'artifacts',
            filter: `created_by=eq.${session.user.id}`
          },
          () => refreshCount()
        )
        .subscribe()
    })()

    return () => { 
      if (approvalChannel) supabaseClient.removeChannel(approvalChannel) 
      if (artifactChannel) supabaseClient.removeChannel(artifactChannel)
    }
  }, [refreshCount, isDashboard])

  // 60-second fallback — reconciles count drift in envs where Realtime is unreliable
  useEffect(() => {
    if (!isDashboard) return
    const poll = setInterval(refreshCount, 60_000)
    return () => clearInterval(poll)
  }, [refreshCount, isDashboard])

  return null
}
