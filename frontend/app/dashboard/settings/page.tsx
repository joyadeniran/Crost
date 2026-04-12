export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ModeToggle } from '@/components/ui/ModeToggle'
import { HealthWidget } from '@/components/settings/HealthWidget'
import { IdentityEditor } from '@/components/settings/IdentityEditor'
import { ExpireApprovalsButton } from '@/components/settings/ExpireApprovalsButton'
import { ApiKeysSettings } from '@/components/settings/ApiKeysSettings'
import { ModelAssignmentForm } from '@/components/settings/ModelAssignmentForm'
import { McpSettings } from '@/components/settings/McpSettings'

export default async function SettingsPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  const supabase = createServerSupabaseClient()

  const [configsRes, toolsRes, profileRes] = await Promise.all([
    supabase.from('system_config').select('*').eq('created_by', user?.id).order('key'),
    supabase.from('available_tools')
      .select('*')
      .eq('user_id', user?.id)
      .eq('is_action', false)
      .eq('requires_config', true)
      .order('label'),
    supabase.from('company_profile').select('founder_name, company_name').eq('created_by', user?.id).maybeSingle(),
  ])

  const configs = configsRes.data ?? []
  const tools = toolsRes.data ?? []

  // Prefer system_config value (set via identity editor), fall back to company_profile from onboarding
  const founderName  = configs.find(c => c.key === 'founder_name')?.value ?? profileRes.data?.founder_name
  const companyName  = configs.find(c => c.key === 'company_name')?.value ?? profileRes.data?.company_name

  const founderStr = founderName ? String(founderName).replace(/"/g, '') : ''
  const companyStr = companyName ? String(companyName).replace(/"/g, '') : ''

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 800, fontSize: 32, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.04em' }}>
          System Configuration
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 600, lineHeight: 1.6 }}>
          Manage your AI workforce parameters, secure API credentials, and connected business tools from this centralized control hub.
        </p>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', 
        gap: 24, 
        alignItems: 'start' 
      }}>
        {/* Column 1: Core Credentials */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            CORE CREDENTIALS
          </div>
          <ApiKeysSettings />

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            MODEL ROUTING
          </div>
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            overflow: 'hidden',
          }}>
            <ModelAssignmentForm />
          </section>
          
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            IDENTITY & CONTEXT
          </div>
          <IdentityEditor 
            initialFounder={founderStr} 
            initialCompany={companyStr} 
          />
        </div>

        {/* Column 2: Connected Tools */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            INTEGRATIONS & MCP
          </div>
          <McpSettings initialTools={tools} />
        </div>

        {/* Column 3: Operational Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            OPERATIONAL LIMITS
          </div>
          
          {/* AI Mode toggle */}
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px 20px',
            position: 'relative',
            overflow: 'hidden'
          }}>
             <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: '100%', background: 'var(--accent)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
                  Private Delegation
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                  Switch between <b>LOCAL</b> execution and <b>CLOUD</b> execution through your configured LiteLLM providers.
                </p>
              </div>
              <ModeToggle />
            </div>
          </section>

          {/* Token limits — usage meter is rendered inside ApiKeysSettings (client component) */}

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            SYSTEM HEALTH
          </div>
          <HealthWidget />

          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
          }}>
            <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
              Maintenance
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
              Clean up expired approvals from the queue.
            </p>
            <ExpireApprovalsButton />
          </section>
        </div>
      </div>
    </div>
  )
}
