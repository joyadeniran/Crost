export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase'
import { SidebarNav } from '@/components/dashboard/SidebarNav'
import { Topbar } from '@/components/dashboard/Topbar'
import { LiveEventsPanel } from '@/components/dashboard/LiveEventsPanel'
import { LayoutStoreHydrator } from '@/components/providers/LayoutStoreHydrator'
import type { EventLogEntry } from '@/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient()

  // Cookie is the primary source of truth for env_mode — set by /api/toggle.
  // DB is the fallback (covers first load before any toggle).
  const cookieStore = cookies()
  const cookieMode = cookieStore.get('env_mode')?.value

  const [pendingResult, eventsResult, configResult, modeResult] = await Promise.all([
    supabase.from('approval_queue').select('id').eq('status', 'pending'),
    supabase.from('event_log').select('*').order('created_at', { ascending: false }).limit(20),
    supabase.from('system_config').select('key, value').eq('key', 'local_identity').single(),
    // Only hit DB for mode if no cookie yet
    cookieMode
      ? Promise.resolve({ data: null, error: null })
      : supabase.from('system_config').select('value').eq('key', 'env_mode').single(),
  ])

  const pendingCount = pendingResult.data?.length ?? 0
  const events = (eventsResult.data ?? []) as EventLogEntry[]
  const identity = configResult.data?.value
    ? String(configResult.data.value).replace(/"/g, '')
    : 'Crost'

  // Cookie wins over DB — once the user toggles, the cookie is always authoritative
  const dbMode = String(modeResult.data?.value ?? '').replace(/"/g, '')
  const envMode: 'local' | 'cloud' =
    (cookieMode === 'cloud' || dbMode === 'cloud') ? 'cloud' : 'local'

  return (
    <div className="crost-shell">
      {/* ── SIDEBAR ── */}
      <aside className="crost-sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="logo-mark">C</div>
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
        <SidebarNav pendingCount={pendingCount} identity={identity} />

        {/* Seeds Zustand + keeps pending count live across all pages */}
        <LayoutStoreHydrator pendingCount={pendingCount} envMode={envMode} />
      </aside>

      {/* ── MAIN ── */}
      <div className="crost-main">
        {/* Topbar — client component for pathname-based title */}
        <Topbar />

        {/* Content + events panel */}
        <div className="crost-content">
          <div className="crost-page">
            {children}
          </div>
          <LiveEventsPanel initial={events} />
        </div>
      </div>
    </div>
  )
}
