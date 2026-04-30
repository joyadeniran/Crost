'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase-browser'

export function ApprovalsLiveRefresh() {
  const router = useRouter()
  // Circuit breaker: debounce rapid refreshes (e.g. bulk approval state changes)
  // and stop completely if the page returns 404 (deleted approval list).
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consecutiveErrorsRef = useRef(0)
  const MAX_CONSECUTIVE_ERRORS = 3

  useEffect(() => {
    let channel: ReturnType<typeof supabaseClient.channel> | null = null

    ;(async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return

      channel = supabaseClient
        .channel('approvals-page-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'approval_queue',
            filter: `user_id=eq.${session.user.id}`,
          },
          () => {
            // Circuit breaker: stop refreshing after repeated failures
            if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) return

            // Debounce: collapse rapid events into a single refresh
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
            refreshTimerRef.current = setTimeout(() => {
              try {
                router.refresh()
                consecutiveErrorsRef.current = 0
              } catch {
                consecutiveErrorsRef.current++
              }
            }, 150)
          }
        )
        .subscribe()
    })()

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      if (channel) supabaseClient.removeChannel(channel)
    }
  }, [router])

  return null
}
