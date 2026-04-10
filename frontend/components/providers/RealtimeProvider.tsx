'use client'

import { useEffect } from 'react'
import { supabaseClient } from '@/lib/supabase-browser'
import { useCrostStore } from '@/lib/store'
import type { Department } from '@/types'

interface Props {
  initialDepartments: Department[]
  initialPendingCount: number
  children: React.ReactNode
}

/**
 * Initialises Zustand with SSR department data and wires Supabase Realtime subscriptions.
 * envMode is managed exclusively by LayoutStoreHydrator (in the layout) so it is
 * never overwritten here on dashboard navigation.
 */
export function RealtimeProvider({
  initialDepartments,
  initialPendingCount,
  children,
}: Props) {
  const {
    setDepartments,
    setPendingApprovalCount,
    setIsLoading,
    upsertDepartment,
    removeDepartment,
  } = useCrostStore()

  // Hydrate store from server-rendered data — NOT envMode (layout owns that)
  useEffect(() => {
    setDepartments(initialDepartments)
    setPendingApprovalCount(initialPendingCount)
    setIsLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Departments Realtime subscription
  useEffect(() => {
    const channel = supabaseClient
      .channel('departments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'departments' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            upsertDepartment(payload.new as Department)
          } else if (payload.eventType === 'DELETE') {
            removeDepartment((payload.old as Department).id)
          }
        }
      )
      .subscribe()

    return () => { supabaseClient.removeChannel(channel) }
  }, [upsertDepartment, removeDepartment])

  // Approval queue Realtime — update pending count
  useEffect(() => {
    const channel = supabaseClient
      .channel('approvals-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'approval_queue' },
        async () => {
          // Re-fetch pending count on any change
          const { data } = await supabaseClient
            .from('approval_queue')
            .select('id')
            .eq('status', 'pending')
          setPendingApprovalCount(data?.length ?? 0)
        }
      )
      .subscribe()

    return () => { supabaseClient.removeChannel(channel) }
  }, [setPendingApprovalCount])

  return <>{children}</>
}
