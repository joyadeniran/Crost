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

  // Departments Realtime subscription — scoped to current user to prevent cross-tenant leakage
  useEffect(() => {
    let channel: ReturnType<typeof supabaseClient.channel> | null = null
    ;(async () => {
      const { data: { session } } = await supabaseClient.auth.getSession()
      if (!session?.user) return
      channel = supabaseClient
        .channel('departments-realtime')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'departments',
            filter: `user_id=eq.${session.user.id}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              upsertDepartment(payload.new as Department)
            } else if (payload.eventType === 'DELETE') {
              removeDepartment((payload.old as Department).id)
            }
          }
        )
        .subscribe()
    })()

    return () => { if (channel) supabaseClient.removeChannel(channel) }
  }, [upsertDepartment, removeDepartment])

  // Approval queue count is managed by LayoutStoreHydrator (payload-based, no REST roundtrip).

  return <>{children}</>
}
