export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
import { LiveDepartmentGrid } from '@/components/departments/LiveDepartmentGrid'
import { DashboardActions } from '@/components/departments/DashboardActions'
import { WarRoom } from '@/components/war-room/WarRoom'
import { Department } from '@/types'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    redirect('/login')
  }
  const currentUser = user

  const supabase = createServerSupabaseClient()
  async function cloneTemplatesForLegacyUser() {
    const { data: templates } = await supabase
      .from('departments')
      .select('*')
      .is('created_by', null)
      .neq('activation_stage', 'deprecated')
      .order('created_at')

    const nonOrchestratorTemplates = (templates ?? []).filter((dept: any) => !dept.is_orchestrator)
    const orchestratorTemplate = (templates ?? []).find((dept: any) => dept.is_orchestrator)

    for (const template of nonOrchestratorTemplates) {
      const { error } = await supabase.from('departments').insert({
        name: template.name,
        slug: template.slug,
        persona_prompt: template.persona_prompt,
        tone_override: template.tone_override,
        capabilities: template.capabilities,
        restrictions: template.restrictions,
        tools: template.tools,
        model_provider: template.model_provider,
        model_name: template.model_name,
        icon: template.icon,
        color: template.color,
        is_orchestrator: false,
        created_by: currentUser.id,
        activation_stage: template.activation_stage === 'active' ? 'active' : 'draft',
        status: 'idle',
      })
      if (error) {
        console.warn('[dashboard] Legacy department provisioning failed:', error.message)
        return false
      }
    }

    if (orchestratorTemplate) {
      const { error } = await supabase.from('departments').insert({
        name: orchestratorTemplate.name,
        slug: orchestratorTemplate.slug,
        persona_prompt: orchestratorTemplate.persona_prompt,
        tone_override: orchestratorTemplate.tone_override,
        capabilities: orchestratorTemplate.capabilities,
        restrictions: orchestratorTemplate.restrictions,
        tools: orchestratorTemplate.tools,
        model_provider: orchestratorTemplate.model_provider,
        model_name: orchestratorTemplate.model_name,
        icon: orchestratorTemplate.icon,
        color: orchestratorTemplate.color,
        is_orchestrator: true,
        created_by: currentUser.id,
        activation_stage: 'active',
        status: 'idle',
      })
      if (error) {
        console.warn('[dashboard] Legacy orchestrator provisioning failed:', error.message)
        return false
      }
    }

    return true
  }

  let deptResult = await supabase
    .from('departments')
    .select('*')
    .eq('created_by', currentUser.id)
    .neq('activation_stage', 'deprecated')
    .neq('slug', 'orchestrator')
    .order('created_at')

  if ((deptResult.data?.length ?? 0) === 0) {
    const provisioned = await cloneTemplatesForLegacyUser()
    if (provisioned) {
      deptResult = await supabase
        .from('departments')
        .select('*')
        .eq('created_by', currentUser.id)
        .neq('activation_stage', 'deprecated')
        .neq('slug', 'orchestrator')
        .order('created_at')
    }
  }

  const [approvalResult, identityResult] = await Promise.all([
    supabase.from('approval_queue').select('id').eq('status', 'pending').eq('created_by', currentUser.id),
    supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['company_name', 'company_identity'])
      .eq('created_by', currentUser.id),
  ])

  const departments = (deptResult.data ?? []) as Department[]
  const pendingCount = approvalResult.data?.length ?? 0
  const companyName = identityResult.data?.find((row) => row.key === 'company_name')?.value
  const companyIdentity = identityResult.data?.find((row) => row.key === 'company_identity')?.value
  const identityLabel = companyName
    ? String(companyName).replace(/"/g, '')
    : companyIdentity
      ? String(companyIdentity).replace(/"/g, '').split('.')[0]
      : null

  const activeCount  = departments.filter((d) => d.activation_stage === 'active').length
  const runningCount = departments.filter((d) => d.status === 'running').length
  const unsyncedCount = departments.filter((d) => {
    if (d.activation_stage !== 'active') return false
    const id = d.orc_persona_id
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
