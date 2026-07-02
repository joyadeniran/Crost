// lib/engine/parse.ts
// Pure parsing/formatting helpers: approval-request extraction and
// orchestrator-response parsing. Extracted verbatim from lib/llm-client.ts
// during the Phase 2 god-module split — no behavior change.

const APPROVAL_SIGNAL_MARKER = 'REQUEST_APPROVAL'
// Note: the original lib/llm-client.ts also declared an unused
// APPROVAL_REGEX const here (dead code) — dropped during the split since it
// had no references anywhere in the module.

export interface ApprovalRequest {
  action_type: string
  action_label: string
  reasoning: string
  payload: Record<string, unknown>
  context: string
}

export function extractJsonObject(text: string, fromIndex: number): string | null {
  const start = text.indexOf('{', fromIndex)
  if (start === -1) return null

  // Scan from the end backward to find the longest valid JSON substring.
  // This is robust against nested braces and text after the JSON block.
  for (let end = text.length; end > start; end--) {
    if (text[end - 1] !== '}') continue
    const candidate = text.slice(start, end)
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

export function parseApprovalRequest(response: string): ApprovalRequest | null | 'BLOCKED' {
  const hasSignal = response.includes(APPROVAL_SIGNAL_MARKER)
  if (!hasSignal) return null

  const stripCodeFence = (text: string): string => {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    return fenced ? fenced[1] : text
  }

  const rawText = stripCodeFence(response)
  const jsonStart = rawText.indexOf('{')
  if (jsonStart === -1) {
    return response.includes('\nREQUEST_APPROVAL') || response.startsWith('REQUEST_APPROVAL') ? 'BLOCKED' : null
  }

  const jsonStr = extractJsonObject(rawText, jsonStart)
  if (!jsonStr) {
    return response.includes('\nREQUEST_APPROVAL') || response.startsWith('REQUEST_APPROVAL') ? 'BLOCKED' : null
  }

  try {
    const parsed = JSON.parse(jsonStr) as Partial<ApprovalRequest>
    const actual = (parsed as any).REQUEST_APPROVAL || parsed

    if (!actual.action_type || !actual.action_label) return null
    if (!actual.reasoning && !actual.context) return null

    return {
      action_type: actual.action_type,
      action_label: actual.action_label,
      reasoning: actual.reasoning ?? '',
      payload: actual.payload ?? {},
      context: actual.context ?? '',
    }
  } catch {
    return 'BLOCKED'
  }
}

export function normalizeClarification(text: string | null | undefined): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

export function parseOrchestratorResponse(raw: string): any {
  let jsonStr = raw.trim()
  const firstBrace = jsonStr.indexOf('{')
  const lastBrace = jsonStr.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (parsed.is_valid_goal === undefined && parsed.plan) parsed.is_valid_goal = true

    if (parsed.is_valid_goal && parsed.plan?.tasks) {
      // Pass 1: build old-LLM-id → new-uuid map and replace task IDs
      // IMPORTANT: depends_on arrays reference the LLM's placeholder IDs.
      // We must remap them AFTER replacing all task IDs, not during.
      const idMap = new Map<string, string>()
      for (const t of parsed.plan.tasks) {
        const newId = crypto.randomUUID()
        idMap.set(t.id, newId)
        t.id = newId
        // Normalize legacy/invalid model aliases to 'cloud' sentinel so
        // runWorkerTask resolves them via user_model_assignments at runtime
        const isLegacyAlias = !t.model
          || t.model.startsWith('cloud/')
          || t.model.startsWith('local/')
        if (isLegacyAlias) t.model = 'cloud'
      }
      // Pass 2: remap depends_on to the new UUIDs
      // Without this, dependency IDs remain as LLM placeholders and
      // the waterfall gate in the worker never resolves — tasks block forever.
      for (const t of parsed.plan.tasks) {
        t.depends_on = (t.depends_on ?? [])
          .map((depId: string) => idMap.get(depId) ?? depId)
          .filter((id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      }
    }
    return { ok: true, ...parsed }
  } catch {
    return { ok: false, reason: 'JSON parse failed' }
  }
}
