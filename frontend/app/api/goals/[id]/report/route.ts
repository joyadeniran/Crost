// POST /api/goals/[id]/report
// Triggers the Orchestrator to synthesize department results into a final report.
// Usually called by the supervision worker after all tasks are completed.

import { NextRequest, NextResponse } from 'next/server'
import { runOrcReport } from '@/lib/llm-client'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }

export async function POST(req: NextRequest, { params }: Params) {
  try {
    // Note: We don't strictly auth gate this because it's an internal system trigger
    // but in production, you'd want a shared secret header from the worker.
    
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
