// lib/orc-decision-gate.ts
// Brain 1 (Memory) + Brain 2 (Decision Tree) from ORC_ORCHESTRATION_UPGRADE_PLAN.md §B.1
// Server-side ONLY — never import from a client component.

import { createServerSupabaseClient } from '@/lib/supabase'

// ─── orc_context in-memory cache ─────────────────────────────────────────────
// 60-second TTL per user. Avoids a Supabase round-trip on every orchestration
// call. Invalidated on seedOrcContextFromMemo writes.

const ORC_CONTEXT_CACHE = new Map<string, { rows: OrcContextRow[]; cachedAt: number }>()
const ORC_CONTEXT_CACHE_TTL = 60_000 // ms

export function invalidateOrcContextCache(userId: string): void {
  ORC_CONTEXT_CACHE.delete(userId)
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrcResponseMode =
  | 'assistant'      // Simple question — answer directly, no plan
  | 'clarify'        // Goal clear but 1-2 critical pieces missing
  | 'quick_plan'     // Routine goal — 3-5 tasks, execute with confidence
  | 'full_plan'      // Complex strategic goal — deep analysis, multi-dept
  | 'direct_action'  // Low-risk action — execute immediately (send email, save KB)
  | 'command'        // Explicit system command (retry, cancel, status)
  | 'escalate'       // Exceeds capabilities — surface alternatives

export interface OrcDecision {
  mode: OrcResponseMode
  confidence: number        // 0.5–1.0
  reasoning: string         // one-sentence rationale (surfaced in debug panel)
  risk_notes: string[]      // warnings, missing info flags
  followup_options: string[] // 1-3 short action labels for the UI
}

export interface OrcContextRow {
  id: string
  context_type: 'profile' | 'strategy' | 'preference' | 'constraint' | 'outcome'
  content: Record<string, unknown>
  summary: string | null
  recency_score: number
  source: string
}

// ─── Brain 1: Memory ─────────────────────────────────────────────────────────

/**
 * Fetches top-20 orc_context rows for the user, ranked by recency_score.
 * Returns [] if userId is null or on any DB error (fail-open).
 */
export async function fetchOrcContext(userId: string | null): Promise<OrcContextRow[]> {
  if (!userId) return []

  const cached = ORC_CONTEXT_CACHE.get(userId)
  if (cached && Date.now() - cached.cachedAt < ORC_CONTEXT_CACHE_TTL) {
    return cached.rows
  }

  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('orc_context')
      .select('id, context_type, content, summary, recency_score, source')
      .eq('user_id', userId)
      .order('recency_score', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(20)
    const rows = (data ?? []) as OrcContextRow[]
    ORC_CONTEXT_CACHE.set(userId, { rows, cachedAt: Date.now() })
    return rows
  } catch (err) {
    console.error('[fetchOrcContext] Error:', err)
    return []
  }
}

/**
 * One-time auto-seed: extracts profile/strategy/outcomes from company_memo
 * and writes them into orc_context so Brain 1 has data on first run.
 * Idempotent — skips if rows already exist for this user.
 * Fire-and-forget safe.
 */
export async function seedOrcContextFromMemo(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabaseClient()

    const { count } = await supabase
      .from('orc_context')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)

    if ((count ?? 0) > 0) return

    const { data: memo } = await supabase
      .from('company_memo')
      .select('company_profile, active_goals, strategies, decisions')
      .eq('user_id', userId)
      .maybeSingle()

    if (!memo) return

    const rows: Array<Omit<OrcContextRow, 'id'> & { user_id: string }> = []

    if (memo.company_profile && Object.keys(memo.company_profile as object).length > 0) {
      const p = memo.company_profile as Record<string, string>
      rows.push({
        user_id: userId,
        context_type: 'profile',
        content: p,
        summary: `${p.name || ''} ${p.industry ? `(${p.industry})` : ''} - ${p.description || ''}`.trim(),
        recency_score: 80,
        source: 'extracted_from_memos',
      })
    }

    if (Array.isArray(memo.strategies) && memo.strategies.length > 0) {
      const strats = memo.strategies as Array<Record<string, string>>
      rows.push({
        user_id: userId,
        context_type: 'strategy',
        content: { strategies: strats },
        summary: strats.slice(0, 3).map(s => s.title || String(s)).join('; '),
        recency_score: 70,
        source: 'extracted_from_memos',
      })
    }

    if (Array.isArray(memo.decisions) && memo.decisions.length > 0) {
      const recent = (memo.decisions as Array<Record<string, string>>).slice(-10)
      rows.push({
        user_id: userId,
        context_type: 'outcome',
        content: { decisions: recent },
        summary: recent.map(d => `[${d.made_by}] ${d.title}: ${d.decision}`).join('\n'),
        recency_score: 75,
        source: 'extracted_from_memos',
      })
    }

    if (rows.length > 0) {
      await supabase.from('orc_context').insert(rows)
      invalidateOrcContextCache(userId)
    }
  } catch (err) {
    console.error('[seedOrcContextFromMemo] Failed (non-fatal):', err)
  }
}

/**
 * Formats OrcContextRow[] into a compact text block suitable for LLM injection.
 */
export function formatOrcContextForPrompt(rows: OrcContextRow[]): string {
  if (rows.length === 0) return ''

  const grouped: Record<string, string[]> = {}
  for (const row of rows) {
    if (!grouped[row.context_type]) grouped[row.context_type] = []
    grouped[row.context_type].push(
      row.summary || JSON.stringify(row.content).slice(0, 200)
    )
  }

  const parts: string[] = []
  if (grouped.profile)    parts.push(`COMPANY PROFILE:\n${grouped.profile.join('\n')}`)
  if (grouped.strategy)   parts.push(`STRATEGIC GOALS:\n${grouped.strategy.join('\n')}`)
  if (grouped.preference) parts.push(`FOUNDER PREFERENCES:\n${grouped.preference.join('\n')}`)
  if (grouped.constraint) parts.push(`CONSTRAINTS:\n${grouped.constraint.join('\n')}`)
  if (grouped.outcome)    parts.push(`PAST OUTCOMES:\n${grouped.outcome.join('\n')}`)

  return parts.join('\n\n')
}

// ─── KB enrichment ───────────────────────────────────────────────────────────

export interface KbMatch {
  title: string
  summary: string
  category: string
}

/**
 * Proactively retrieves up to 3 KB documents relevant to the intent.
 * Uses a direct Supabase query (no HTTP overhead) so it can run in parallel
 * with other pre-processing. Skips the search entirely if the KB is empty.
 * Always returns [] on any error — fire-and-forget safe.
 */
export async function enrichWithKnowledgeBase(
  intent: string,
  userId: string | null
): Promise<KbMatch[]> {
  if (!userId) return []
  try {
    const supabase = createServerSupabaseClient()

    const { count } = await supabase
      .from('knowledge_base_files')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('processing_status', 'completed')

    if ((count ?? 0) === 0) return []

    const searchTerm = intent.slice(0, 80)
    const { data: files } = await supabase
      .from('knowledge_base_files')
      .select('title, category, extracted_summary')
      .eq('created_by', userId)
      .eq('processing_status', 'completed')
      .or(`title.ilike.%${searchTerm}%,extracted_summary.ilike.%${searchTerm}%`)
      .order('reference_count', { ascending: false })
      .limit(3)

    if (!files || files.length === 0) return []

    return files.map(f => ({
      title: f.title,
      summary: f.extracted_summary || '',
      category: f.category || '',
    }))
  } catch (err) {
    console.error('[enrichWithKnowledgeBase] Error (non-fatal):', err)
    return []
  }
}

/**
 * Formats KB matches into a compact block for Orc prompt injection.
 */
export function formatKbContextForPrompt(matches: KbMatch[]): string {
  if (matches.length === 0) return ''
  const lines = matches.map(m => {
    const snippet = m.summary.length > 200 ? m.summary.slice(0, 200) + '...' : m.summary
    return `- "${m.title}" (${m.category}): ${snippet}`
  })
  return `RELEVANT KNOWLEDGE BASE DOCUMENTS:\n${lines.join('\n')}`
}

// ─── Brain 2: Decision Tree ───────────────────────────────────────────────────

const VALID_MODES: OrcResponseMode[] = [
  'assistant', 'clarify', 'quick_plan', 'full_plan', 'direct_action', 'command', 'escalate',
]

const DECISION_GATE_SYSTEM_NOTE = `You are Orc's intent classifier. Respond with valid JSON only — no prose, no markdown fences.

Classify the founder's input into exactly one response mode:

- "assistant":     Simple question answerable directly from context. ("What can you do?", "What's our runway?", "Who are you?")
- "direct_action": Low-risk assistant action to execute immediately. ("/gmail.send_email", "Save to KB", "Remind me later")
- "clarify":       Goal is clear but 1-2 critical pieces of info are missing that would significantly change the plan.
- "quick_plan":    Routine goal matching historical patterns. 3-5 tasks, can execute with confidence and minimal info.
- "full_plan":     Complex strategic goal requiring multi-department coordination, deep analysis, or risk assessment.
- "command":       An explicit system command or override. ("Retry", "Cancel", "Show me all tasks", "Stop")
- "escalate":      Goal exceeds system capabilities or requires human authority. Surface alternatives instead.

Return exactly this JSON shape:
{
  "mode": "assistant|direct_action|clarify|quick_plan|full_plan|command|escalate",
  "confidence": <number 0.5-1.0>,
  "reasoning": "<one sentence why this mode>",
  "risk_notes": ["<risk or missing info flag>"],
  "followup_options": ["<1-3 short action labels for the UI>"]
}`

const DEFAULT_DECISION: OrcDecision = {
  mode: 'full_plan',
  confidence: 0.5,
  reasoning: 'Classification unavailable — defaulting to full plan mode.',
  risk_notes: [],
  followup_options: [],
}

/**
 * Brain 2: Classifies founder intent using a fast LLM model before the main
 * orchestrator runs. Returns OrcDecision with mode, confidence, and risk flags.
 * Always returns a valid decision — fails open to 'full_plan' on any error.
 *
 * @param extraRiskNotes - Pre-computed risk notes from assessGoalRisk() to inject
 *   into the classifier prompt so the model has full risk context when choosing a mode.
 */
export async function orcDecisionGate(
  founderInput: string,
  orcContext: OrcContextRow[],
  conversationHistory: Array<{ role: string; content: string }> = [],
  extraRiskNotes: string[] = []
): Promise<OrcDecision> {
  try {
    const contextSummary = formatOrcContextForPrompt(orcContext)
    const recentHistory = conversationHistory
      .slice(-4)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')

    const classifierPrompt = [
      `FOUNDER INPUT: ${founderInput}`,
      contextSummary ? `COMPANY CONTEXT:\n${contextSummary}` : '',
      recentHistory  ? `RECENT CONVERSATION:\n${recentHistory}` : '',
      extraRiskNotes.length > 0 ? `PRE-ASSESSED RISK NOTES:\n${extraRiskNotes.map(n => `- ${n}`).join('\n')}` : '',
    ].filter(Boolean).join('\n\n')

    const fastModel = process.env.CLOUD_MODEL_CLASSIFIER ?? 'groq/llama-3.1-8b-instant'
    const litellmUrl = process.env.LITELLM_BASE_URL ?? 'http://localhost:4000'
    const masterKey  = process.env.LITELLM_MASTER_KEY

    const res = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(masterKey && { Authorization: `Bearer ${masterKey}` }),
      },
      body: JSON.stringify({
        model: fastModel,
        messages: [
          { role: 'system', content: DECISION_GATE_SYSTEM_NOTE },
          { role: 'user',   content: classifierPrompt },
        ],
        temperature: 0.1, // low temp → consistent classification
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn(`[orcDecisionGate] Classifier HTTP ${res.status} — using fallback`)
      return DEFAULT_DECISION
    }

    const data = await res.json()
    const raw: string = data.choices?.[0]?.message?.content ?? ''

    const first = raw.indexOf('{')
    const last  = raw.lastIndexOf('}')
    if (first === -1 || last === -1) return DEFAULT_DECISION

    const parsed = JSON.parse(raw.slice(first, last + 1))

    if (!VALID_MODES.includes(parsed.mode as OrcResponseMode)) {
      console.warn(`[orcDecisionGate] Unknown mode "${parsed.mode}" — using fallback`)
      return DEFAULT_DECISION
    }

    const classifierRiskNotes: string[] = Array.isArray(parsed.risk_notes) ? parsed.risk_notes : []

    return {
      mode:             parsed.mode as OrcResponseMode,
      confidence:       Math.min(1.0, Math.max(0.5, Number(parsed.confidence) || 0.7)),
      reasoning:        typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      risk_notes:       [...new Set([...classifierRiskNotes, ...extraRiskNotes])],
      followup_options: Array.isArray(parsed.followup_options) ? parsed.followup_options : [],
    }
  } catch (err) {
    console.error('[orcDecisionGate] Classification failed:', err)
    return { ...DEFAULT_DECISION, risk_notes: extraRiskNotes }
  }
}
