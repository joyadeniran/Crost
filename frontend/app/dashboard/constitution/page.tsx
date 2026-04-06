export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { ConstitutionEditor } from '@/components/settings/ConstitutionEditor'

export default async function ConstitutionPage() {
  const supabase = createServerSupabaseClient()
  const { data: constitutionRow } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'agent_constitution')
    .single()

  const constitution = constitutionRow?.value as string | undefined

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 24, color: 'var(--text)', marginBottom: 2, letterSpacing: '-0.02em' }}>
          Crost Constitution
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Defined safety boundaries & core operational rules.</p>
      </div>

      <div style={{ maxWidth: 800 }}>
        {constitution ? (
          <ConstitutionEditor constitution={constitution} />
        ) : (
          <div style={{ color: 'var(--text-3)', fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 12 }}>
            Constitution not found. Check system_config table.
          </div>
        )}
      </div>
    </div>
  )
}
