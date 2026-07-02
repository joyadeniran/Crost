// POST /api/adk — Run a founder goal through the ADK agent pipeline.
// Returns Server-Sent Events stream of agent activity.

import { NextRequest, NextResponse } from 'next/server'
import { createDbClient } from '@/lib/db'
import { runGoal } from '@/lib/adk/runner'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const RunGoalSchema = z.object({
  founder_input: z.string().min(5).max(2000),
})

export async function POST(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const body = await req.json()
    const { founder_input } = RunGoalSchema.parse(body)

    const db = createDbClient()

    // Create goal record
    const { data: goal, error: goalErr } = await db
      .from('goals')
      .insert({
        founder_input,
        status: 'executing',
        created_by: user.id,
        pipeline: 'adk',
      })
      .single()

    if (goalErr || !goal) {
      return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 })
    }

    const goalId = (goal as any).id

    // Return SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        send({ type: 'goal_created', goalId })

        try {
          for await (const event of runGoal({ goalId, userId: user.id, goalText: founder_input })) {
            send(event)
          }
          send({ type: 'done', goalId })
        } catch (err: any) {
          send({ type: 'error', message: err.message })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Goal-Id': goalId,
      },
    })
  } catch (err: any) {
    if (err.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 })
    }
    console.error('[POST /api/adk]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// GET /api/adk — Get ADK agent status and capabilities
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    status: 'ready',
    platform: 'Google Cloud Vertex AI',
    model: process.env.CLOUD_MODEL ?? 'gemini/gemini-2.5-flash',
    framework: '@google/adk',
    capabilities: [
      'multi_agent_orchestration',
      'knowledge_base_search',
      'artifact_creation',
      'human_in_the_loop_approvals',
      'mcp_tool_integration',
      'streaming_execution',
    ],
    agents: ['orc', 'marketing', 'engineering', 'sales', 'research', 'operations'],
  })
}
