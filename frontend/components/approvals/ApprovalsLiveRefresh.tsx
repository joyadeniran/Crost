'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase-browser'

export function ApprovalsLiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    const channel = supabaseClient
      .channel('approvals-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_queue' }, () => {
        router.refresh()
      })
      .subscribe()

    return () => { supabaseClient.removeChannel(channel) }
  }, [router])

  return null
}
