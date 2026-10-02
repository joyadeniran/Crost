export const dynamic = 'force-dynamic'

import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { HealthWidget } from '@/components/settings/HealthWidget'
import { IdentityEditor } from '@/components/settings/IdentityEditor'

const GOOGLE_STATUS: Record<string, string> = {
  connected: 'Gmail connected.',
  connected_no_refresh: 'Connected, but Google did not grant long-term access — reconnect to make it durable.',
  denied: 'Google access was declined.',
  not_configured: 'Gmail is not configured on this server yet.',
  state_mismatch: 'That connect attempt expired — please try again.',
  error: 'Could not connect Gmail — please try again.',
}

export default async function SettingsPage({ searchParams }: { searchParams?: { google?: string } }) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  const supabase = createServerSupabaseClient()

  const [configsRes, profileRes, googleRes] = await Promise.all([
    supabase.from('system_config').select('*').eq('created_by', user?.id).order('key'),
    supabase.from('company_profile').select('founder_name, company_name').eq('created_by', user?.id).maybeSingle(),
    supabase.from('connections').select('id').eq('created_by', user?.id).eq('service_name', 'google').maybeSingle(),
  ])
  const gmailConnected = !!googleRes.data
  const googleStatusMessage = (searchParams?.google && GOOGLE_STATUS[searchParams.google]) || ''

  const configs = configsRes.data ?? []

  // Prefer system_config value (set via identity editor), fall back to company_profile from onboarding
  const founderName  = configs.find((c: any) => c.key === 'founder_name')?.value ?? profileRes.data?.founder_name
  const companyName  = configs.find((c: any) => c.key === 'company_name')?.value ?? profileRes.data?.company_name
  const founderIdentity = configs.find((c: any) => c.key === 'founder_identity')?.value
  const companyIdentity = configs.find((c: any) => c.key === 'company_identity')?.value
  const assistantIdentity = configs.find((c: any) => c.key === 'assistant_identity')?.value

  const founderStr = founderName ? String(founderName).replace(/"/g, '') : ''
  const companyStr = companyName ? String(companyName).replace(/"/g, '') : ''
  const founderIdentityStr = founderIdentity
    ? String(founderIdentity).replace(/"/g, '')
    : (founderStr ? `Founder: ${founderStr}` : '')
  const companyIdentityStr = companyIdentity
    ? String(companyIdentity).replace(/"/g, '')
    : (companyStr ? `Company: ${companyStr}` : '')
  const assistantIdentityStr = assistantIdentity
    ? String(assistantIdentity).replace(/"/g, '')
    : 'You are Orc, Crost\'s Chief of Staff. Support the founder, speak clearly, and never claim the founder\'s identity as your own.'

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 800, fontSize: 32, color: 'var(--text)', marginBottom: 6, letterSpacing: '-0.04em' }}>
          System Configuration
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 600, lineHeight: 1.6 }}>
          Your identity, system health and approval-queue maintenance.
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
            IDENTITY & CONTEXT
          </div>
          <IdentityEditor 
            initialFounder={founderStr} 
            initialCompany={companyStr} 
            initialFounderIdentity={founderIdentityStr}
            initialCompanyIdentity={companyIdentityStr}
            initialAssistantIdentity={assistantIdentityStr}
          />
        </div>

        {/* Column 3: Operational Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            SYSTEM
          </div>
          
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            SYSTEM HEALTH
          </div>
          <HealthWidget />

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.1em', marginBottom: -8 }}>
            GMAIL
          </div>
          <section style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
          }}>
            <div style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 6 }}>
              Send email on approval {gmailConnected ? '· Connected' : ''}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14, lineHeight: 1.5 }}>
              Connect your Google account so Crost can send an email from your Gmail, only after you approve it. {googleStatusMessage}
            </p>
            <a href="/api/connect/google/start" className="btn-primary-crost" style={{ textDecoration: 'none', display: 'inline-block' }}>
              {gmailConnected ? 'Reconnect Gmail' : 'Connect Gmail'}
            </a>
          </section>
        </div>
      </div>
    </div>
  )
}
