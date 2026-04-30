/**
 * LiteLLM proxy response factories.
 *
 * All Playwright E2E specs import these and use page.route() to intercept
 * POST /v1/chat/completions, returning deterministic JSON without hitting
 * real LLM providers. This keeps tests fast, free, and reproducible.
 */
import type { Route } from '@playwright/test'

export const LITELLM_URL_PATTERN = '**/v1/chat/completions'

// ── LiteLLM response envelope ──────────────────────────────────────────────

function litellmEnvelope(content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'groq/llama-3.3-70b-versatile',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
  }
}

// ── Orchestrator responses ─────────────────────────────────────────────────

/** Valid 2-task orchestrator plan dispatching to marketing + executive */
export function orcPlanResponse(goalId: string) {
  const t1 = 'task-aa000000-0000-0000-0000-000000000001'
  const t2 = 'task-bb000000-0000-0000-0000-000000000002'
  return litellmEnvelope(
    JSON.stringify({
      is_valid_goal: true,
      is_direct_response: false,
      summary: 'Research and draft outreach strategy',
      tasks: [
        {
          id: t1,
          dept: 'marketing',
          label: 'Research target audience',
          action: 'market_research',
          reasoning: 'Need audience data before drafting copy',
          params: { topic: 'B2B SaaS founders' },
          depends_on: [],
          risk: 'low',
        },
        {
          id: t2,
          dept: 'executive',
          label: 'Draft outreach email',
          action: 'draft_document',
          reasoning: 'Compose outreach based on research',
          params: { format: 'email' },
          depends_on: [t1],
          risk: 'medium',
        },
      ],
    })
  )
}

/** Direct @orc response — no plan spawned */
export function orcDirectResponse(answer: string) {
  return litellmEnvelope(
    JSON.stringify({
      is_valid_goal: false,
      is_direct_response: true,
      direct_response: answer,
    })
  )
}

/** Orc plan that tries to use a non-existent department (hallucination) */
export function orcHallucinatedDeptResponse() {
  return litellmEnvelope(
    JSON.stringify({
      is_valid_goal: true,
      is_direct_response: false,
      summary: 'Hallucinated plan',
      tasks: [
        {
          id: 'task-cc000000-0000-0000-0000-000000000003',
          dept: 'quantum_computing', // not a real dept
          label: 'Do impossible thing',
          action: 'quantum_task',
          reasoning: 'hallucinated',
          params: {},
          depends_on: [],
          risk: 'low',
        },
      ],
    })
  )
}

// ── Worker responses ───────────────────────────────────────────────────────

/** Worker returns needs_more_data — triggers BLOCKED state */
export function workerNeedsDataResponse(missingItems: string[]) {
  return litellmEnvelope(
    JSON.stringify({
      needs_more_data: true,
      missing_data: missingItems,
      summary: 'Insufficient context to proceed with market research.',
    })
  )
}

/** Worker requests tool approval (gmail send) */
export function workerRequestsApprovalResponse() {
  return litellmEnvelope(
    JSON.stringify({
      REQUEST_APPROVAL: {
        action_type: 'gmail.send_email',
        action_label: 'Send outreach email to prospect list',
        reasoning: 'Ready to send the drafted email',
        risk: 'medium',
        params: {
          to: 'prospects@example.com',
          subject: 'Quick intro',
          body: 'Hi there…',
        },
      },
    })
  )
}

/** Worker successfully completes a task — returns a document artifact */
export function workerCompletedDocumentResponse() {
  return litellmEnvelope(
    JSON.stringify({
      skill: 'docx',
      title: 'Outreach Email Draft',
      content_for_word: {
        sections: [
          {
            heading: 'Subject',
            body: 'Quick intro from Crost',
          },
          {
            heading: 'Body',
            body: 'Hi — I wanted to reach out about…',
          },
        ],
      },
      summary: 'Outreach email drafted and ready for review.',
    })
  )
}

/** Worker completes market research — returns markdown */
export function workerCompletedResearchResponse() {
  return litellmEnvelope(
    JSON.stringify({
      format: 'md',
      title: 'Target Audience Research',
      content: '# B2B SaaS Founders\n\nKey insights…',
      summary: 'Research completed.',
    })
  )
}

// ── Provider failure ───────────────────────────────────────────────────────

/** Simulates LiteLLM 503 — triggers the resilient fallback chain */
export function litellm503Response() {
  return { status: 503, body: JSON.stringify({ error: 'LiteLLM error - Service unavailable' }) }
}

export function litellm429Response() {
  return {
    status: 429,
    body: JSON.stringify({ error: 'LiteLLM error - Rate limit exceeded' }),
  }
}

// ── Route helpers ──────────────────────────────────────────────────────────

/** Intercept LiteLLM calls; the handler decides the response based on call count */
export function routeLLMSequence(
  route: Route,
  callIndex: number,
  responses: ReturnType<typeof litellmEnvelope>[]
) {
  const response = responses[Math.min(callIndex, responses.length - 1)]
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(response),
  })
}
