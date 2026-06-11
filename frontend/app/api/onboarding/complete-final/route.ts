import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { updateCompanyProfile } from '@/lib/company-memo'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()
    const body = await req.json().catch(() => ({}))
    const identity = body.identity ?? {}
    const selectedDepartments = Array.isArray(body.selectedDepartments) ? body.selectedDepartments : []
    const riskTolerance = body.riskTolerance ?? null
    const step = typeof body.step === 'string' ? body.step : 'complete'

    if (Object.keys(identity).length > 0) {
      // DUAL-WRITE: Populate structured company_memo (Spec §8)
      await updateCompanyProfile(supabase, user.id, {
        name: identity.companyName || null,
        industry: identity.businessCategory || null,
        location: identity.city ? `${identity.city}, ${identity.country}` : identity.country || null,
        description: identity.businessDescription || null
      }).catch(err => console.error('[Onboarding-Final] company_memo dual-write failed:', err))

      await supabase
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
          local_identity: identity,
        }, {
          onConflict: 'created_by'
        })

      const configItems = [
        { key: 'founder_name', value: identity.founderName || '', created_by: user.id },
        { key: 'company_name', value: identity.companyName || '', created_by: user.id },
        { key: 'local_identity', value: identity, created_by: user.id },
      ]

      if (riskTolerance) {
        configItems.push({ key: 'risk_tolerance', value: riskTolerance, created_by: user.id })
      }

      configItems.push(
        { key: 'onboarding_step', value: step, created_by: user.id },
        { key: 'onboarding_complete', value: step === 'complete', created_by: user.id }
      )

      for (const item of configItems) {
        await supabase.from('system_config').upsert(item)
      }

      const foundationalMemos = [
        {
          created_by: user.id,
          from_department: 'system',
          from_department_id: null,
          title: 'Company Identity',
          body: `${identity.companyName || 'The company'} is ${identity.businessCategory || identity.businessDescription || 'still being defined'}. Founded by ${identity.founderName || 'the founder'}, based in ${identity.city ? `${identity.city}, ${identity.country}` : identity.country || 'location not specified'}. Current stage: ${identity.stage || 'not specified'}.`,
          tags: ['all', 'foundational'],
          priority: 'high',
          is_foundational: true,
        }
      ]

      if (identity.businessDescription) {
        foundationalMemos.push({
          created_by: user.id,
          from_department: 'system',
          from_department_id: null,
          title: 'Business Model',
          body: identity.businessDescription,
          tags: ['all', 'foundational', 'business-model'],
          priority: 'high',
          is_foundational: true,
        })
      }

      for (const memo of foundationalMemos) {
        const { data: existingMemo } = await supabase
          .from('company_memos')
          .select('id')
          .eq('created_by', user.id)
          .eq('title', memo.title)
          .eq('is_foundational', true)
          .maybeSingle()

        if (existingMemo?.id) {
          await supabase.from('company_memos').update(memo).eq('id', existingMemo.id)
        } else {
          await supabase.from('company_memos').insert(memo)
        }
      }
    }

    if (selectedDepartments.length > 0) {
      for (const slug of selectedDepartments) {
        const { data: existing } = await supabase
          .from('departments')
          .select('id')
          .eq('slug', slug)
          .eq('created_by', user.id)
          .maybeSingle()

        if (existing) {
          await supabase.from('departments').update({ activation_stage: 'active' }).eq('id', existing.id)
          continue
        }

        const { data: template } = await supabase
          .from('departments')
          .select('*')
          .eq('slug', slug)
          .is('created_by', null)
          .maybeSingle()

        if (template) {
          await supabase.from('departments').insert({
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
        }
      }
    }

    // 1. Mark the routing step in Firebase custom claims (small + best-effort).
    // Firebase caps custom claims at 1000 bytes, so the identity object must NOT
    // go here — it is persisted in system_config ('local_identity') and
    // company_profile above. Never let a claims failure abort the save.
    try {
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: { onboarding_step: step }
      })
    } catch (claimsErr) {
      console.error('[Onboarding Final] setting onboarding_step claim failed (non-fatal):', claimsErr)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[Onboarding Complete Final API Error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
