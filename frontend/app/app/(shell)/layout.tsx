export const dynamic = 'force-dynamic'

import { getPool } from '@/lib/db'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { MobileTopBar } from '@/components/chat/MobileTopBar'
import { ContentWrapper } from '@/components/dashboard/ContentWrapper'
import { LayoutStoreHydrator } from '@/components/providers/LayoutStoreHydrator'

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

  const [pendingResult, configResult, artifactListResult] = await Promise.all([
    // Check both user_id and created_by for robustness
    // EGRESS: COUNT in SQL — never ship row ids/bodies just to count them (this layout runs on every navigation)
    getPool().query(
      `SELECT count(*)::int AS n FROM approval_queue WHERE status = 'pending' AND (created_by = $1 OR user_id = $1)`,
      [user.id]
    ).then(r => ({ data: r.rows[0]?.n ?? 0, error: null as { message: string } | null }))
     .catch((e: Error) => ({ data: 0, error: { message: e.message } })),
    supabase.from('system_config').select('key, value').in('key', ['company_name', 'company_identity']).eq('created_by', user.id),
    // EGRESS: SQL count; excludes failed tool-execution artifacts (matches artifacts/page.tsx) without fetching bodies
    getPool().query(
      `SELECT count(*)::int AS n FROM artifacts
        WHERE created_by = $1
          AND title NOT LIKE '[TOOL EXECUTION FAILED%'
          AND coalesce(left(body, 22), '') NOT LIKE '[TOOL EXECUTION FAILED%'`,
      [user.id]
    ).then(r => ({ data: r.rows[0]?.n ?? 0, error: null as { message: string } | null }))
     .catch((e: Error) => ({ data: 0, error: { message: e.message } })),
  ])

  // Log errors silently — don't crash the layout, but surface for debugging
  if (pendingResult.error) console.error('[Layout] pending count error:', pendingResult.error.message)
  if (artifactListResult.error) console.error('[Layout] artifact count error:', artifactListResult.error.message)

  const pendingCount = pendingResult.data ?? 0
  // Match the client-side filter in artifacts/page.tsx: exclude failed tool execution artifacts
  const artifactCount = artifactListResult.data ?? 0
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
      {/* Phones: top bar with a menu button; the sidebar below becomes a slide-in drawer. */}
      <MobileTopBar pendingCount={pendingCount} />
      {/* ── SIDEBAR ── */}
      <aside className="crost-sidebar">
        <ChatSidebar pendingCount={pendingCount} identity={identity} />
        {/* Seeds Zustand + keeps the approvals badge live across pages */}
        <LayoutStoreHydrator pendingCount={pendingCount} artifactCount={artifactCount} envMode={envMode} />
      </aside>

      <main className="crost-main">
        <ContentWrapper>{children}</ContentWrapper>
      </main>
    </div>
  )
}
