'use client'

import { useEffect } from 'react'
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

  // Keep pending count live on every page (not just the dashboard)
  useEffect(() => {
    const channel = supabaseClient
      .channel('layout-approvals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_queue' }, async () => {
        const { data } = await supabaseClient.from('approval_queue').select('id').eq('status', 'pending')
        setPendingApprovalCount(data?.length ?? 0)
      })
      .subscribe()
    return () => { supabaseClient.removeChannel(channel) }
  }, [setPendingApprovalCount])

  return null
}
