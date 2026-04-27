'use client'

import { useCallback, useEffect } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
import { useCrostStore } from '@/lib/store'

interface Props {
  pendingCount: number
  envMode: 'local' | 'cloud'
}

/**
 * Seeds the Zustand store with layout-level SSR data (pending count + env mode)
 * and keeps the pending count live via Realtime — runs on every dashboard page.
 */
export function LayoutStoreHydrator({ pendingCount, envMode }: Props) {
  const { setPendingApprovalCount, setEnvMode } = useCrostStore()

  // Seed from server data
  useEffect(() => {
    setPendingApprovalCount(pendingCount)
    setEnvMode(envMode)
  }, [pendingCount, envMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshCount = useCallback(async () => {
    // Get session to filter by user ID (prevents wide scans and timeouts)
    const { data: { session } } = await supabaseClient.auth.getSession()
    if (!session?.user) return

    const { data, error } = await supabaseClient
      .from('approval_queue')
      .select('id')
      .eq('status', 'pending')
      .or(`created_by.eq.${session.user.id},user_id.eq.${session.user.id}`)

    if (!error) {
      setPendingApprovalCount(data?.length ?? 0)
    } else {
      console.error('[LayoutStoreHydrator] Refresh failed:', error.message)
    }
  }, [setPendingApprovalCount])

  // Realtime subscription — re-fetch on any change instead of optimistic
  // increment/decrement. This avoids cross-user count contamination.
  useEffect(() => {
    let channel: any;

    ;(async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return

      channel = supabaseClient
        .channel('layout-approvals-realtime')
        .on(
          'postgres_changes',
          { 
            event: '*', 
            schema: 'public', 
            table: 'approval_queue',
            filter: `user_id=eq.${session.user.id}`
          },
          () => {
            // Always refresh — payload doesn't tell us which user owns the row,
            // so optimistic updates would leak counts across users.
            refreshCount()
          }
        )
        .subscribe()
    })()

    return () => { 
      if (channel) supabaseClient.removeChannel(channel) 
    }
  }, [refreshCount])

  // 60-second fallback — reconciles count drift in envs where Realtime is unreliable
  useEffect(() => {
    const poll = setInterval(refreshCount, 60_000)
    return () => clearInterval(poll)
  }, [refreshCount])

  return null
}
