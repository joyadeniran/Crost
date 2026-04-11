import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate using the cookie-aware SSR client
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    // 2. Use the Service Role client for high-privilege database writes
    const supabase = createServerSupabaseClient()

    const body = await req.json()
    const { 
      identity, 
      riskTolerance, 
      selectedDepartments,
      termsVersion = '1.0',
      privacyVersion = '1.0'
    } = body

    // Handle X-Forwarded-For to get IP if available in the headers
    const ip_address = req.headers.get('x-forwarded-for') || req.ip || null;

    // 1. Upsert company_profile (dedicated table for company context)
    const { error: profileErr } = await supabase
      .from('company_profile')
      .upsert({
        created_by: user.id,
        company_name: identity.companyName || '',
        founder_name: identity.founderName || '',
        city: identity.city || null,
        country: identity.country || null,
        business_description: identity.businessDescription || null,
        business_category: identity.businessCategory || null,
        stage: identity.stage || null,
        local_identity: identity
      }, {
        onConflict: 'created_by'
      })

    if (profileErr) {
      console.error('Error upserting company_profile:', profileErr)
    }

    // 2. Generate foundational memos from company profile
    // These are always included in agent context and never pruned
    const foundationalMemos = [
      {
        created_by: user.id,
        from_department: 'system',
        from_department_id: null,
        title: 'Company Identity',
        body: `${identity.companyName} is ${identity.businessCategory || identity.businessDescription}. Founded by ${identity.founderName}, based in ${identity.city ? `${identity.city}, ${identity.country}` : identity.country || 'location not specified'}. Current stage: ${identity.stage || 'not specified'}.`,
        tags: ['all', 'foundational'],
        priority: 'high',
        is_foundational: true
      }
    ]

    // Add business model memo if available
    if (identity.businessDescription) {
      foundationalMemos.push({
        created_by: user.id,
        from_department: 'system',
        from_department_id: null,
        title: 'Business Model',
        body: identity.businessDescription,
        tags: ['all', 'foundational', 'business-model'],
        priority: 'high',
        is_foundational: true
      })
    }

    // Insert foundational memos
    for (const memo of foundationalMemos) {
      const { error: memoErr } = await supabase
        .from('company_memos')
        .insert(memo)
      
      if (memoErr) {
        console.error('Error inserting foundational memo:', memoErr)
      }
    }

    // 3. Upsert system_config values (multi-tenant safe with created_by)
    const configItems = [
      { key: 'risk_tolerance', value: riskTolerance, created_by: user.id },
      { key: 'onboarding_step', value: 'activated', created_by: user.id },
      { key: 'onboarding_complete', value: false, created_by: user.id }
    ]

    for (const item of configItems) {
      const { error: configErr } = await supabase
        .from('system_config')
        .upsert(item)
      
      if (configErr) {
        console.error(`Error upserting config ${item.key}:`, configErr)
      }
    }

    // 4. Activate selected departments (attributed to user)
    // For new users, departments only exist as global templates (created_by = NULL from seed).
    // Clone the templates to this user's account so RLS and multi-tenant isolation work correctly.
    if (selectedDepartments && selectedDepartments.length > 0) {
      for (const slug of selectedDepartments) {
        // Check if user already has this department
        const { data: existing } = await supabase
          .from('departments')
          .select('id')
          .eq('slug', slug)
          .eq('created_by', user.id)
          .maybeSingle()

        if (existing) {
          // Already exists — just activate
          await supabase.from('departments').update({ activation_stage: 'active' }).eq('id', existing.id)
        } else {
          // Clone from global template
          const { data: template } = await supabase
            .from('departments')
            .select('*')
            .eq('slug', slug)
            .is('created_by', null)
            .maybeSingle()

          if (template) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, created_at, updated_at, ...rest } = template
            await supabase.from('departments').insert({
              ...rest,
              created_by: user.id,
              activation_stage: 'active',
              status: 'idle',
            })
          }
        }
      }

      // Also seed the orchestrator for this user if it doesn't exist yet
      const { data: existingOrc } = await supabase
        .from('departments')
        .select('id')
        .eq('slug', 'orchestrator')
        .eq('created_by', user.id)
        .maybeSingle()

      if (!existingOrc) {
        const { data: orcTemplate } = await supabase
          .from('departments')
          .select('*')
          .eq('slug', 'orchestrator')
          .is('created_by', null)
          .maybeSingle()

        if (orcTemplate) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, created_at, updated_at, ...rest } = orcTemplate
          await supabase.from('departments').insert({
            ...rest,
            created_by: user.id,
            activation_stage: 'active',
            status: 'idle',
          })
        }
      }
    }

    // 5. Update User metadata (robust secondary storage)
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { 
        display_name: identity.founder_name,
        onboarding_step: 'activated',
        local_identity: identity
      }
    })

    // 6. Record User Consent
    await supabase.from('user_consents').insert({
      created_by: user.id,
      terms_version: termsVersion,
      privacy_version: privacyVersion,
      ip_address
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Onboarding Complete API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
