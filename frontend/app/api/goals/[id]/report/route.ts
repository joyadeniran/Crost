// POST /api/goals/[id]/report
// Triggers the Orchestrator to synthesize department results into a final report.
// Usually called by the supervision worker after all tasks are completed.

import { NextRequest, NextResponse } from 'next/server'
import { runOrcReport } from '@/lib/llm-client'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const INTERNAL_SECRET = process.env.WORKER_INTERNAL_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY
    const internalSecret = req.headers.get('x-crost-internal-secret')

    if (internalSecret && INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
      // Trusted internal call from worker — proceed directly
    } else {
      // Browser/session call — require auth + ownership
      const authClient = await createSupabaseServerComponentClient()
      const { data: { user } } = await authClient.auth.getUser()
      if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

      const supabase = createServerSupabaseClient()
      const { data: goal } = await supabase
        .from('goals')
        .select('id')
        .eq('id', params.id)
        .eq('created_by', user.id)
        .maybeSingle()

      if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 })
    }

    await runOrcReport(params.id)

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[POST /api/goals/[id]/report]', err)
    return NextResponse.json(
      { success: false, error: 'Failed to generate report', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
