// GET /api/departments  — list all non-deprecated departments


import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // Auth on every route — templates included (onboarding happens post-login).
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const supabase = createServerSupabaseClient()
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') ?? 'default'
    const activeOnly = searchParams.get('active_only') === 'true'
    const includeOrchestrator = searchParams.get('include_orchestrator') === 'true'

    // Template browsing (during onboarding): global template departments only.
    if (scope === 'templates') {
      let query = supabase
        .from('departments')
        .select('*')
        .is('created_by', null) // Only fetch templates (created_by IS NULL)
        .neq('activation_stage', 'deprecated')
        .order('created_at')
      if (activeOnly) query = query.eq('activation_stage', 'active')
      if (!includeOrchestrator) query = query.eq('is_orchestrator', false)
      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ data: data ?? [] })
    }

    // Return user's own departments OR global templates
    let query = supabase
      .from('departments')
      .select('*')
      .or(`created_by.eq.${user.id},created_by.is.null`)
      .neq('activation_stage', 'deprecated')
      .order('created_at')
    if (activeOnly) query = query.eq('activation_stage', 'active')
    if (!includeOrchestrator) query = query.eq('is_orchestrator', false)
    const { data, error } = await query
    if (error) throw error

    const userDepts = (data ?? []).filter((d: any) => d.created_by === user.id)
    const templateDepts = (data ?? []).filter((d: any) => d.created_by === null)
    const userSlugs = new Set(userDepts.map((dept: any) => dept.slug))

    let result = userDepts.length > 0 ? userDepts : templateDepts
    if (scope === 'user') {
      result = userDepts
    } else if (scope === 'all') {
      result = [
        ...userDepts,
        ...templateDepts.filter((dept: any) => !userSlugs.has(dept.slug)),
      ]
    }

    return NextResponse.json({ data: result })
  } catch (err) {
    console.error('[GET /api/departments]', err)
    return NextResponse.json({ error: 'Failed to fetch departments' }, { status: 500 })
  }
}
