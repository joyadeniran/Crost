// lib/adk/runner.ts
// Google ADK Runner for Crost — orchestrates OrcAgent + DepartmentAgents.
// Server-side ONLY.

import {
  Runner,
  InMemorySessionService,
  GcsArtifactService,
  isFinalResponse,
  getFunctionCalls,
  getFunctionResponses,
} from '@google/adk'
import type { Content } from '@google/genai'
import { buildAgentTree } from './agents'

let _runner: Runner | null = null

async function getRunner(): Promise<Runner> {
  if (_runner) return _runner

  const agent = await buildAgentTree()
  const sessionService = new InMemorySessionService()

  const bucket = process.env.GCS_BUCKET
  _runner = new Runner({
    appName: 'crost',
    agent,
    sessionService,
    ...(bucket && { artifactService: new GcsArtifactService(bucket) }),
  })

  return _runner
}

export function resetRunner() {
  _runner = null
}

// ─── Event types emitted to API consumers ────────────────────────────────────

export interface RunGoalEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'agent_switch' | 'final' | 'error'
  content?: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  agent?: string
  isFinal?: boolean
}

// ─── Core execution function ──────────────────────────────────────────────────

export async function* runGoal(params: {
  goalId: string
  userId: string
  goalText: string
}): AsyncGenerator<RunGoalEvent> {
  const { goalId, userId, goalText } = params

  try {
    const runner = await getRunner()

    // Create or reuse ADK session (keyed to goalId)
    const session = await runner.sessionService.createSession({
      appName: 'crost',
      userId,
      sessionId: goalId,
      state: { goalId, userId, startedAt: new Date().toISOString() },
    })

    const userMessage: Content = {
      role: 'user',
      parts: [{
        text: `GOAL_ID: ${goalId}\nUSER_ID: ${userId}\n\nFOUNDER REQUEST:\n${goalText}`,
      }],
    }

    for await (const event of runner.runAsync({
      userId,
      sessionId: session.id,
      newMessage: userMessage,
    })) {
      // Who sent this event?
      const author = event.author ?? 'orc'

      // Tool calls (agent asking to run a tool)
      const fnCalls = getFunctionCalls(event)
      for (const call of fnCalls) {
        yield {
          type: 'tool_call',
          agent: author,
          tool: call.name,
          args: call.args as Record<string, unknown>,
        }
      }

      // Tool results (tool execution completed)
      const fnResponses = getFunctionResponses(event)
      for (const resp of fnResponses) {
        yield {
          type: 'tool_result',
          agent: author,
          tool: resp.name,
          result: resp.response,
        }
      }

      // Text content from the agent
      const textParts = (event.content?.parts ?? []).filter((p: any) => p.text && !p.functionCall && !p.functionResponse)
      for (const part of textParts) {
        if (part.text?.trim()) {
          yield { type: 'text', agent: author, content: part.text }
        }
      }

      // Agent transfer
      if ((event.actions as any)?.transferToAgent) {
        yield { type: 'agent_switch', agent: (event.actions as any).transferToAgent }
      }

      // Final response
      if (isFinalResponse(event)) {
        const finalText = (event.content?.parts ?? [])
          .filter((p: any) => p.text)
          .map((p: any) => p.text)
          .join('')

        yield { type: 'final', content: finalText, agent: author, isFinal: true }
        return
      }
    }
  } catch (err: any) {
    console.error('[adk/runner] runGoal error:', err)
    yield { type: 'error', content: err.message }
  }
}
