export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { ModeToggle } from '@/components/ui/ModeToggle'
import { HealthWidget } from '@/components/settings/HealthWidget'
import { IdentityEditor } from '@/components/settings/IdentityEditor'
import { ConstitutionEditor } from '@/components/settings/ConstitutionEditor'
import { ExpireApprovalsButton } from '@/components/settings/ExpireApprovalsButton'

export default async function SettingsPage() {
  const supabase = createServerSupabaseClient()
  const { data: configs } = await supabase
    .from('system_config')
    .select('*')
    .order('key')

  const constitution = configs?.find(c => c.key === 'agent_constitution')?.value as string | undefined
  const tokenLimit   = configs?.find(c => c.key === 'token_hard_limit_per_session')?.value
  const identity     = configs?.find(c => c.key === 'local_identity')?.value
  const identityStr  = identity ? String(identity).replace(/"/g, '') : ''

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 2 }}>
          Settings
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>System configuration &amp; service health</p>
      </div>

      {/* Service Health — client widget */}
      <HealthWidget />

      {/* Founder Identity */}
      <IdentityEditor initial={identityStr} />

      {/* Mode toggle */}
      <section style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 4 }}>
              AI Mode
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Local uses Ollama on your machine. Cloud calls Gemini, Groq, or Claude APIs directly.
            </p>
          </div>
          <ModeToggle />
        </div>
      </section>

      {/* Token limits */}
      <section style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 16,
      }}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 12 }}>
          Token Limits
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span style={{ color: 'var(--text-2)' }}>Hard limit per session</span>
          <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12, color: 'var(--accent)' }}>
            {String(tokenLimit ?? 50000).replace(/"/g, '')} tokens
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>
          Departments warn at 80% and auto-switch to local at 100%. If local also hits limit, the task is paused.
        </p>
      </section>

      {/* Approval maintenance */}
      <section style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '18px 20px',
        marginBottom: 16,
      }}>
        <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
          Approval Queue Maintenance
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>
          Approvals pending for more than 24 hours are automatically marked as expired. You can also trigger this manually.
        </p>
        <ExpireApprovalsButton />
      </section>

      {/* Constitution */}
      {constitution && <ConstitutionEditor constitution={constitution} />}
    </div>
  )
}
