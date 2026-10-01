export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ConstitutionEditor } from '@/components/settings/ConstitutionEditor'

export default async function ConstitutionPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createServerSupabaseClient()
  
  let constitution = ''

  try {
    const [userConstitutionResult, globalConstitutionResult] = await Promise.all([
      supabase
        .from('system_config')
        .select('value')
        .eq('key', 'agent_constitution')
        .eq('created_by', user.id)
        .maybeSingle(),
      supabase
        .from('system_config')
        .select('value')
        .eq('key', 'agent_constitution')
        .is('created_by', null)
        .maybeSingle(),
    ])

    const val = userConstitutionResult.data?.value ?? globalConstitutionResult.data?.value ?? ''
    
    // Robust parsing of JSONB value which might be a quoted string or raw text
    if (typeof val === 'string') {
      constitution = val
    } else {
      constitution = JSON.stringify(val, null, 2).replace(/^"|"$/g, '').replace(/\\n/g, '\n')
    }
  } catch (err) {
    console.error('[ConstitutionPage] Fetch error:', err)
    constitution = 'Error loading constitution. Please refresh the page.'
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 24, color: 'var(--text)', marginBottom: 2, letterSpacing: '-0.02em' }}>
          Crost Constitution
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Defined safety boundaries and core operational rules.</p>
      </div>

      <div style={{ maxWidth: 800 }}>
        <ConstitutionEditor constitution={constitution} />
      </div>
    </div>
  )
}
