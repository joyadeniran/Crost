import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { updateCompanyProfile } from '@/lib/company-memo'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate using the cookie-aware SSR client
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

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

    // DUAL-WRITE: Populate structured company_memo (Spec §8)
    await updateCompanyProfile(supabase, user.id, {
      name: identity.companyName || null,
      industry: identity.businessCategory || null,
      location: identity.city ? `${identity.city}, ${identity.country}` : identity.country || null,
      description: identity.businessDescription || null
    }).catch(err => console.error('[Onboarding] company_memo dual-write failed:', err))

    const founderIdentity = identity.founderIdentity?.trim()
      || (identity.founderName ? `Founder: ${identity.founderName}` : '')
    const companyIdentity = identity.companyIdentity?.trim()
      || [
        identity.companyName ? `${identity.companyName} is the business being operated in Crost.` : '',
        identity.businessCategory || identity.businessDescription || '',
      ].filter(Boolean).join(' ')
    const assistantIdentity = identity.assistantIdentity?.trim()
      || `You are Orc, Crost's Chief of Staff for ${identity.companyName || 'the founder'}.
Support the founder with clear plans, grounded execution, and crisp updates.
Never claim the founder's personal identity as your own.`

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

    // Insert or refresh foundational memos without duplicating them across partial setup resumes.
    for (const memo of foundationalMemos) {
      const { data: existingMemo } = await supabase
        .from('company_memos')
        .select('id')
        .eq('created_by', user.id)
        .eq('title', memo.title)
        .eq('is_foundational', true)
        .maybeSingle()

      if (existingMemo?.id) {
        const { error: memoErr } = await supabase
          .from('company_memos')
          .update(memo)
          .eq('id', existingMemo.id)

        if (memoErr) {
          console.error('Error updating foundational memo:', memoErr)
        }
      } else {
        const { error: memoErr } = await supabase
          .from('company_memos')
          .insert(memo)

        if (memoErr) {
          console.error('Error inserting foundational memo:', memoErr)
        }
      }
    }

    // 3. Upsert system_config values (multi-tenant safe with created_by)
    const configItems = [
      { key: 'founder_name', value: identity.founderName || '', created_by: user.id },
      { key: 'company_name', value: identity.companyName || '', created_by: user.id },
      { key: 'founder_identity', value: founderIdentity, created_by: user.id },
      { key: 'company_identity', value: companyIdentity, created_by: user.id },
      { key: 'assistant_identity', value: assistantIdentity, created_by: user.id },
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

    const { data: existingConstitution } = await supabase
      .from('system_config')
      .select('key')
      .eq('key', 'agent_constitution')
      .eq('created_by', user.id)
      .maybeSingle()

    if (!existingConstitution) {
      // Global config rows use the '__global__' sentinel (created_by is NOT NULL).
      const { data: globalConstitution } = await supabase
        .from('system_config')
        .select('value, is_founder_editable')
        .eq('key', 'agent_constitution')
        .eq('created_by', '__global__')
        .maybeSingle()

      if (globalConstitution?.value) {
        await supabase.from('system_config').upsert({
          key: 'agent_constitution',
          value: globalConstitution.value,
          created_by: user.id,
          is_founder_editable: globalConstitution.is_founder_editable ?? true,
        })
      }
    }

    // 4. Activate selected departments (attributed to user)
    // For new users, departments only exist as global templates (created_by = NULL from seed).
    // Clone the templates to this user's account so RLS and multi-tenant isolation work correctly.
    let activatedCount = 0
    if (selectedDepartments && selectedDepartments.length > 0) {
      for (const slug of selectedDepartments) {
        // Check if user already has this department
        const { data: existing, error: existingErr } = await supabase
          .from('departments')
          .select('id')
          .eq('slug', slug)
          .eq('created_by', user.id)
          .maybeSingle()

        if (existingErr) {
          console.error(`Error checking existing department ${slug}:`, existingErr)
          continue
        }

        if (existing) {
          // Already exists — just activate
          const { error: updateErr } = await supabase.from('departments').update({ activation_stage: 'active' }).eq('id', existing.id)
          if (updateErr) {
            console.error(`Error updating department ${slug}:`, updateErr)
          } else {
            activatedCount++
          }
        } else {
          // Clone from global template
          const { data: template, error: templateErr } = await supabase
            .from('departments')
            .select('*')
            .eq('slug', slug)
            .is('created_by', null)
            .maybeSingle()

          if (templateErr) {
            console.error(`Error fetching template for ${slug}:`, templateErr)
            continue
          }

          if (template) {
            // Clone template: copy all fields except ID/timestamps, add user context
            const { error: insertErr } = await supabase.from('departments').insert({
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
              is_orchestrator: template.is_orchestrator,
              created_by: user.id,
              orc_persona_id: `direct_llm:${template.slug}`,
              activation_stage: 'active',
              status: 'idle',
            })
            if (insertErr) {
              console.error(`Error cloning department ${slug}:`, insertErr)
            } else {
              activatedCount++
            }
          } else {
            console.warn(`Template not found for department: ${slug}`)
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
          // Clone Orc template for this user
          await supabase.from('departments').insert({
            name: orcTemplate.name,
            slug: orcTemplate.slug,
            persona_prompt: orcTemplate.persona_prompt,
            tone_override: orcTemplate.tone_override,
            capabilities: orcTemplate.capabilities,
            restrictions: orcTemplate.restrictions,
            tools: orcTemplate.tools,
            model_provider: orcTemplate.model_provider,
            model_name: orcTemplate.model_name,
            icon: orcTemplate.icon,
            color: orcTemplate.color,
            is_orchestrator: orcTemplate.is_orchestrator,
            created_by: user.id,
            orc_persona_id: `direct_llm:${orcTemplate.slug}`,
            activation_stage: 'active',
            status: 'idle',
          })
        }
      }

      // If the founder picked departments but none could be activated, the save
      // genuinely failed — surface it instead of reporting a hollow success.
      if (activatedCount === 0) {
        return NextResponse.json(
          { error: 'Could not activate any of the selected departments. Please try again.' },
          { status: 500 }
        )
      }
    }

    // 5. Update Firebase custom claims — ONLY the small routing flag.
    // Firebase caps custom claims at 1000 bytes; the full identity object used to
    // be stored here and reliably overflowed, throwing and failing the whole save.
    // The authoritative copies live in company_profile + system_config + memos, so
    // this is best-effort secondary storage and must never abort onboarding.
    try {
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { onboarding_step: 'activated' }
      })
    } catch (claimsErr) {
      console.error('[Onboarding] setting onboarding_step claim failed (non-fatal):', claimsErr)
    }

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
