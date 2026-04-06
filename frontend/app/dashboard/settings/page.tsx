export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { ModeToggle } from '@/components/ui/ModeToggle'
import { HealthWidget } from '@/components/settings/HealthWidget'
import { IdentityEditor } from '@/components/settings/IdentityEditor'
import { ExpireApprovalsButton } from '@/components/settings/ExpireApprovalsButton'
import { ApiKeysSettings } from '@/components/settings/ApiKeysSettings'
import { McpSettings } from '@/components/settings/McpSettings'

export default async function SettingsPage() {
  const supabase = createServerSupabaseClient()
  
  const [configsRes, toolsRes] = await Promise.all([
    supabase.from('system_config').select('*').order('key'),
    supabase.from('available_tools').select('*').eq('requires_config', true).order('label')
  ])

  const configs = configsRes.data ?? []
  const tools = toolsRes.data ?? []

  const tokenLimit   = configs.find(c => c.key === 'token_hard_limit_per_session')?.value
  const identity     = configs.find(c => c.key === 'local_identity')?.value
  const identityStr  = identity ? String(identity).replace(/"/g, '') : ''

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 24, color: 'var(--text)', marginBottom: 2, letterSpacing: '-0.02em' }}>
          System Settings
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Management of API credentials, tools, and operational limits.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left Column: Keys & Tools */}
        <div>
          <ApiKeysSettings />
          <McpSettings initialTools={tools} />
        </div>

        {/* Right Column: Identity & Ops */}
        <div>
          {/* AI Mode toggle */}
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px 20px',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
                  Private Delegation Mode
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                  Switch between <b>LOCAL</b> (Ollama) for maximum privacy and <b>CLOUD</b> (Gemini/Groq) for advanced reasoning.
                </p>
              </div>
              <ModeToggle />
            </div>
          </section>

          <IdentityEditor initial={identityStr} />

          {/* Token limits */}
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '24px 20px',
            marginBottom: 20,
          }}>
            <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>
              Account Token Budget
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text-2)' }}>Hard limit per session</span>
              <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12, color: 'var(--accent)' }}>
                {String(tokenLimit ?? 50000).replace(/"/g, '')} tokens
              </span>
            </div>
          </section>

          {/* Service Health */}
          <HealthWidget />

          {/* Approval maintenance */}
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
            marginBottom: 20,
          }}>
            <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
              Approval Maintenance
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
              Approvals pending for more than 24 hours are automatically marked as expired.
            </p>
            <ExpireApprovalsButton />
          </section>
        </div>
      </div>
    </div>
  )
}
