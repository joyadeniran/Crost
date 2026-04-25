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

  // Realtime subscription — update count from payload to avoid a REST roundtrip
  // on every DB change. Falls back to a full re-fetch only when status is ambiguous.
  useEffect(() => {
    const channel = supabaseClient
      .channel('layout-approvals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_queue' },
        (payload) => {
          const newRow = payload.new as { status?: string } | null
          const oldRow = payload.old as { status?: string } | null
          const current = useCrostStore.getState().pendingApprovalCount
          if (payload.eventType === 'INSERT' && newRow?.status === 'pending') {
            setPendingApprovalCount(current + 1)
          } else if (payload.eventType === 'DELETE' && oldRow?.status === 'pending') {
            setPendingApprovalCount(Math.max(0, current - 1))
          } else if (payload.eventType === 'UPDATE') {
            const wasP = oldRow?.status === 'pending'
            const isP = newRow?.status === 'pending'
            if (wasP && !isP) setPendingApprovalCount(Math.max(0, current - 1))
            else if (!wasP && isP) setPendingApprovalCount(current + 1)
          }
        }
      )
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [setPendingApprovalCount])

  // 60-second fallback — reconciles count drift in envs where Realtime is unreliable
  useEffect(() => {
    const poll = setInterval(refreshCount, 60_000)
    return () => clearInterval(poll)
  }, [refreshCount])

  return null
}
