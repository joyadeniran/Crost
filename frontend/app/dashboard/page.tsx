export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
import { LiveDepartmentGrid } from '@/components/departments/LiveDepartmentGrid'
import { DashboardActions } from '@/components/departments/DashboardActions'
import { WarRoom } from '@/components/war-room/WarRoom'
import { Department } from '@/types'

export default async function DashboardPage() {
  const supabase = createServerSupabaseClient()

  const [deptResult, approvalResult, identityResult] = await Promise.all([
    supabase
      .from('departments')
      .select('*')
      .neq('activation_stage', 'deprecated')
      .neq('slug', 'orchestrator')
      .order('created_at'),
    supabase.from('approval_queue').select('id').eq('status', 'pending'),
    supabase
      .from('system_config')
      .select('value')
      .eq('key', 'local_identity')
      .single(),
  ])

  const departments = (deptResult.data ?? []) as Department[]
  const pendingCount = approvalResult.data?.length ?? 0
  const localIdentity = identityResult.data?.value
  const identityLabel = localIdentity && localIdentity !== 'null'
    ? String(localIdentity).replace(/"/g, '')
    : null

  const activeCount  = departments.filter((d) => d.activation_stage === 'active').length
  const runningCount = departments.filter((d) => d.status === 'running').length
  const unsyncedCount = departments.filter((d) => {
    if (d.activation_stage !== 'active') return false
    const id = d.onyx_persona_id
    if (!id || id === 'SYNC_FAILED' || id === 'DIRECT_LLM') return true
    if (id.startsWith('direct_llm:') && id !== `direct_llm:${d.slug}`) return true
    return false
  }).length

  return (
    <RealtimeProvider
      initialDepartments={departments}
      initialPendingCount={pendingCount}
    >
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'var(--font-syne, Syne)',
          fontWeight: 700,
          fontSize: 20,
          color: 'var(--text)',
          marginBottom: 2,
        }}>
          {identityLabel ? `${identityLabel} HQ` : 'Agent Office'}
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Your AI operating system</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'DEPARTMENTS',      value: departments.length },
          { label: 'ACTIVE',           value: activeCount },
          { label: 'RUNNING NOW',      value: runningCount },
        ].map((stat) => (
          <div key={stat.label} style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
          }}>
            <div style={{
              fontFamily: 'var(--font-syne, Syne)',
              fontWeight: 700,
              fontSize: 22,
              color: stat.value > 0 ? 'var(--text)' : 'var(--text-3)',
            }}>
              {stat.value}
            </div>
            <div style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--text-3)',
              letterSpacing: '0.06em',
              marginTop: 2,
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* War Room — goal input + plan card */}
      <WarRoom />

      {/* Departments grid header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            color: 'var(--text-3)',
            letterSpacing: '0.08em',
          }}>
            {departments.length} DEPARTMENTS
          </span>
          {unsyncedCount > 0 && (
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 10,
              color: 'var(--red)',
              letterSpacing: '0.06em',
            }}>
              ⚠ {unsyncedCount} unsynced
            </span>
          )}
        </div>
        <DashboardActions />
      </div>

      <LiveDepartmentGrid />
    </RealtimeProvider>
  )
}
