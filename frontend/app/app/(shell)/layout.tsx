export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { SidebarNav } from '@/components/dashboard/SidebarNav'
import { Topbar } from '@/components/dashboard/Topbar'
import { ContentWrapper } from '@/components/dashboard/ContentWrapper'
import { LayoutStoreHydrator } from '@/components/providers/LayoutStoreHydrator'
import { Logo } from '@/components/ui/Logo'
import type { EventLogEntry } from '@/types'

import { redirect } from 'next/navigation'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Use cookie-aware client for auth check
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Use service role client for DB reads (bypasses RLS, faster)
  const supabase = createServerSupabaseClient()

  const [pendingResult, eventsResult, configResult, artifactListResult] = await Promise.all([
    // Check both user_id and created_by for robustness
    supabase.from('approval_queue').select('id').eq('status', 'pending').or(`created_by.eq.${user.id},user_id.eq.${user.id}`),
    // PRUNED: Fetch only what LiveEventsPanel needs for display
    supabase.from('event_log').select('id, description, event_type, created_at, department_slug').eq('created_by', user.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('system_config').select('key, value').in('key', ['company_name', 'company_identity']).eq('created_by', user.id),
    // Fetch only essential fields for count
    supabase.from('artifacts').select('id, title, body').eq('created_by', user.id).limit(500),
  ])

  // Log errors silently — don't crash the layout, but surface for debugging
  if (pendingResult.error) console.error('[Layout] pending count error:', pendingResult.error.message)
  if (artifactListResult.error) console.error('[Layout] artifact count error:', artifactListResult.error.message)

  const pendingCount = pendingResult.data?.length ?? 0
  // Match the client-side filter in artifacts/page.tsx: exclude failed tool execution artifacts
  const artifactCount = (artifactListResult.data ?? []).filter(
    (a: any) => !a.body?.startsWith('[TOOL EXECUTION FAILED') && !a.title?.startsWith('[TOOL EXECUTION FAILED')
  ).length
  const events = (eventsResult.data ?? []) as EventLogEntry[]
  const companyName = configResult.data?.find((row: any) => row.key === 'company_name')?.value
  const companyIdentity = configResult.data?.find((row: any) => row.key === 'company_identity')?.value
  const identity = companyName
    ? String(companyName).replace(/"/g, '')
    : companyIdentity
      ? String(companyIdentity).replace(/"/g, '').split('.')[0]
      : 'Crost'

  // Beta: cloud execution only.
  const envMode = 'cloud' as const

  return (
    <div className="crost-shell">
      {/* ── SIDEBAR ── */}
      <aside className="crost-sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <Logo size={28} />
          <span className="logo-text">Crost</span>
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 9,
            color: 'var(--text-3)',
            background: 'var(--bg-3)',
            padding: '2px 6px',
            borderRadius: 4,
          }}>
            v1.0
          </span>
        </div>

        {/* Nav — client component for active state */}
        <SidebarNav pendingCount={pendingCount} artifactCount={artifactCount} identity={identity} />

        {/* Seeds Zustand + keeps pending count live across all pages */}
        <LayoutStoreHydrator pendingCount={pendingCount} artifactCount={artifactCount} envMode={envMode} />
      </aside>

      {/* ── MAIN ── */}
      <div className="crost-main">
        {/* Topbar — client component for pathname-based title */}
        <Topbar />

        {/* Content wrapper handles context-aware sidebar */}
        <ContentWrapper initialEvents={events}>
          {children}
        </ContentWrapper>
      </div>
    </div>
  )
}
