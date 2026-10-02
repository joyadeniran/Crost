export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { RealtimeProvider } from '@/components/providers/RealtimeProvider'
import { WarRoom } from '@/components/war-room/WarRoom'
import { Department } from '@/types'
import { redirect } from 'next/navigation'

function getResumeRoute(step?: string | null) {
  if (step === 'activated') return '/app/onboarding/activate'
  if (step === 'team') return '/app/onboarding/team'
  if (step === 'orc') return '/app/onboarding/orc'
  if (step === 'control') return '/app/onboarding/control'
  return '/app/onboarding/identity'
}

export default async function DashboardPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()

  if (!user) {
    redirect('/login')
  }
  const currentUser = user
  const onboardingStep = currentUser.user_metadata?.onboarding_step
  const onboardingIncomplete = onboardingStep !== 'complete'

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
        orc_persona_id: `direct_llm:${template.slug}`,
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
        orc_persona_id: `direct_llm:${orchestratorTemplate.slug}`,
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
    .select('id, name, slug, persona_prompt, tone_override, capabilities, restrictions, tools, model_provider, model_name, icon, color, is_orchestrator, orc_persona_id, activation_stage, status, created_at')
    .eq('created_by', currentUser.id)
    .neq('activation_stage', 'deprecated')
    .neq('slug', 'orchestrator')
    .order('created_at')

  if ((deptResult.data?.length ?? 0) === 0) {
    const provisioned = await cloneTemplatesForLegacyUser()
    if (provisioned) {
      deptResult = await supabase
        .from('departments')
        .select('id, name, slug, persona_prompt, tone_override, capabilities, restrictions, tools, model_provider, model_name, icon, color, is_orchestrator, orc_persona_id, activation_stage, status, created_at')
        .eq('created_by', currentUser.id)
        .neq('activation_stage', 'deprecated')
        .neq('slug', 'orchestrator')
        .order('created_at')
    }
  }

  // Self-healing: Ensure all existing active/draft departments have a valid cloud bridge ID
  const rawDepartments = (deptResult.data ?? [])
  const needsHealing = rawDepartments.filter((d: any) =>
    d.orc_persona_id === 'SYNC_FAILED' ||
    d.orc_persona_id === 'DIRECT_LLM' ||
    (d.orc_persona_id && d.orc_persona_id.startsWith('direct_llm:') && d.orc_persona_id !== `direct_llm:${d.slug}`)
  )

  if (needsHealing.length > 0) {
    for (const dept of needsHealing) {
      try {
        await supabase
          .from('departments')
          .update({ orc_persona_id: `direct_llm:${dept.slug}` })
          .eq('id', dept.id)
      } catch (e) {
        // Fail silently — DB constraint prevents duplicate direct_llm:slug IDs across different users
        console.warn(`[dashboard] Failed to heal dept ${dept.slug}:`, e)
      }
    }
    // Re-fetch once to have clean local state for the first render
    const { data: healed } = await supabase
      .from('departments')
      .select('id, name, slug, persona_prompt, tone_override, capabilities, restrictions, tools, model_provider, model_name, icon, color, is_orchestrator, orc_persona_id, activation_stage, status, created_at')
      .eq('created_by', currentUser.id)
      .neq('activation_stage', 'deprecated')
      .neq('slug', 'orchestrator')
      .order('created_at')
    deptResult.data = healed
  }

  // Also heal the orchestrator specifically (it is excluded from the list query above)
  const { data: orcDept } = await supabase
    .from('departments')
    .select('id, orc_persona_id, slug')
    .eq('created_by', currentUser.id)
    .eq('slug', 'orchestrator')
    .maybeSingle()

  if (orcDept && (orcDept.orc_persona_id === 'SYNC_FAILED' || orcDept.orc_persona_id === 'DIRECT_LLM' || (orcDept.orc_persona_id && orcDept.orc_persona_id !== 'direct_llm:orchestrator'))) {
    try {
      await supabase
        .from('departments')
        .update({ orc_persona_id: 'direct_llm:orchestrator' })
        .eq('id', orcDept.id)
    } catch (e) {
      console.warn(`[dashboard] Failed to heal orchestrator:`, e)
    }
  }

  const [approvalResult, identityResult] = await Promise.all([
    supabase.from('approval_queue').select('id').eq('status', 'pending').eq('created_by', currentUser.id).limit(100),
    supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['company_name', 'company_identity'])
      .eq('created_by', currentUser.id),
  ])

  const departments = (deptResult.data ?? []) as Department[]
  const pendingCount = approvalResult.data?.length ?? 0
  const companyName = identityResult.data?.find((row: any) => row.key === 'company_name')?.value
  const companyIdentity = identityResult.data?.find((row: any) => row.key === 'company_identity')?.value
  const identityLabel = companyName
    ? String(companyName).replace(/"/g, '')
    : companyIdentity
      ? String(companyIdentity).replace(/"/g, '').split('.')[0]
      : null

  return (
    <RealtimeProvider
      initialDepartments={departments}
      initialPendingCount={pendingCount}
    >
      {/* Chat-first home: a calm greeting, then Orc. Everything else lives behind the sidebar. */}
      <div style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
        {onboardingIncomplete && (
          <a
            href={getResumeRoute(onboardingStep)}
            style={{
              display: 'block',
              marginBottom: 20,
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-bright)',
              color: 'var(--text-2)',
              fontSize: 13,
              textDecoration: 'none',
            }}
          >
            Finish setting up your office <span style={{ color: 'var(--accent)' }}>→</span>
          </a>
        )}
        <h1 style={{
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 34,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          color: 'var(--text)',
          margin: '8px 0 6px',
        }}>
          {identityLabel ? `${identityLabel}, what are we working on?` : 'What are we working on?'}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 28 }}>
          Ask Orc anything, or hand over a goal. Nothing goes out without your approval.
        </p>

        <WarRoom />
      </div>
    </RealtimeProvider>
  )
}
