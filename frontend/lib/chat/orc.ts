// lib/chat/orc.ts — Orc as a chat assistant.
//
// One fast path for every message: build a small system prompt, stream Gemini's reply. Orc answers,
// drafts and thinks out loud in chat itself. Only when real work is needed does it append a
// <plan>…</plan> block, which the UI shows as a card the founder can run (lib/chat/mission.ts).
// Server-side ONLY.

import { BETA_DEPARTMENT_SLUGS, type BetaDepartmentSlug } from '@/lib/beta-departments'
import { GEMINI_FALLBACK_CHAIN } from '@/lib/gemini-client'
import { validateFacts, type ProposedFact } from '@/lib/facts/facts'

export const DEPARTMENT_CAPABILITIES: Record<BetaDepartmentSlug, string> = {
  marketing: 'positioning, campaigns, social posts, landing-page and email copy, content calendars',
  engineering: 'technical plans, specs, architecture notes, API designs, scripts and code',
  sales: 'pitches, outreach sequences, lead research, pipeline plans, proposals',
  operations: 'processes, checklists, budgets, vendor comparisons, timelines, risk reviews',
}

export interface CompanyContext {
  companyName?: string | null
  founderName?: string | null
  description?: string | null
  industry?: string | null
  stage?: string | null
  targetCustomer?: string | null
  location?: string | null
  /** formatFactsForPrompt(listFacts(user)) — the founder-confirmed facts and the do-not-claim list. */
  factsBlock?: string
}

export function buildOrcSystemPrompt(ctx: CompanyContext, now: Date = new Date()): string {
  const company = ctx.companyName?.trim() || 'the founder\'s company'
  const facts = [
    ctx.description && `What it does: ${ctx.description}`,
    ctx.industry && `Industry: ${ctx.industry}`,
    ctx.stage && `Stage: ${ctx.stage}`,
    ctx.targetCustomer && `Customers: ${ctx.targetCustomer}`,
    ctx.location && `Based in: ${ctx.location}`,
  ].filter(Boolean)

  return `You are Orc, chief of staff at ${company}${ctx.founderName ? `, working for ${ctx.founderName}` : ''}. Today is ${now.toISOString().slice(0, 10)}.
${facts.length ? `\nCompany facts:\n${facts.map((f) => `- ${f}`).join('\n')}\n` : ''}${ctx.factsBlock ? `\n${ctx.factsBlock}\n` : ''}
You lead four departments:
${BETA_DEPARTMENT_SLUGS.map((s) => `- ${s}: ${DEPARTMENT_CAPABILITIES[s]}`).join('\n')}

How you work:
- Talk like a sharp, warm colleague. Be concise; short paragraphs, lists only when they help.
- Answer questions, give advice, and draft small things (a tweet, an email reply, a few bullet points) yourself, right in chat. Most messages need no departments.
- Delegate only when the founder wants a substantial deliverable (a document, research, a plan, several pieces of content) or asks you to. Then write one or two sentences saying what the team will do and end your reply with exactly one block:
<plan>{"title":"short mission title","tasks":[{"dept":"marketing","label":"what to do","deliverable":"what comes back","depends_on":[]}]}</plan>
  Use 1-5 tasks, dept must be one of: ${BETA_DEPARTMENT_SLUGS.join(', ')}. depends_on lists earlier task numbers (1-based) whose output a task needs. The founder reviews and runs the plan; never claim work has started.
- If a request is ambiguous in a way that changes the work, ask one short question instead of planning.
- Nothing leaves the company without the founder's approval: never claim you sent, posted, paid or booked anything. Departments prepare drafts and request approval for external actions.
- Never invent facts about ${company}; say what you'd need to know. Figures (revenue, users, prices, dates, percentages) come only from COMPANY FACTS above; a STALE one needs the founder to confirm it first.
- When the founder states a durable fact about the company in their message (a figure, a date, a price, a name, something that is no longer true), offer to remember it: end your reply with exactly one block
<facts>[{"key":"monthly_revenue_usd","value":"12,000","as_of":"2026-09-30","source":"founder, in chat","volatile":true}]</facts>
  Only what the founder actually said, copied exactly — never your estimates or a department's output. as_of only if they gave a date. Use "prohibited":true (value = the claim) when they say something must never be claimed again. The founder confirms before anything is saved; never say it is saved.`
}

// ─── Plan parsing ────────────────────────────────────────────────────────────

export interface PlanTask {
  dept: BetaDepartmentSlug
  label: string
  deliverable: string
  depends_on: number[]
}

export interface ChatPlan {
  title: string
  tasks: PlanTask[]
}

const PLAN_RE = /<plan>([\s\S]*?)(<\/plan>|$)/i

const FACTS_RE = /<facts>([\s\S]*?)(<\/facts>|$)/i

/** Splits a finished Orc reply into the visible text and a validated plan (or null). */
export function extractPlan(raw: string): { reply: string; plan: ChatPlan | null } {
  const { reply, plan } = extractBlocks(raw)
  return { reply, plan }
}

/** Splits a finished reply into visible text, a validated plan and proposed facts (either may be absent). */
export function extractBlocks(raw: string): { reply: string; plan: ChatPlan | null; facts: ProposedFact[] } {
  const p = raw.match(PLAN_RE)
  const f = raw.match(FACTS_RE)
  const cuts = [p?.index, f?.index].filter((i): i is number => typeof i === 'number')
  const reply = (cuts.length ? raw.slice(0, Math.min(...cuts)) : raw).trim()
  return { reply, plan: p ? validatePlan(p[1]) : null, facts: f ? validateFacts(f[1]) : [] }
}

/** Text safe to show while streaming: everything before a (possibly partial) <plan> or <facts> tag. */
export function visibleText(partial: string): string {
  const i = partial.search(/<p(l(a(n>?)?)?)?$|<plan>|<f(a(c(t(s>?)?)?)?)?$|<facts>/i)
  return (i === -1 ? partial : partial.slice(0, i)).trimEnd()
}

export function validatePlan(json: string): ChatPlan | null {
  try {
    const start = json.indexOf('{')
    const end = json.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    const parsed = JSON.parse(json.slice(start, end + 1))
    const allowed = new Set<string>(BETA_DEPARTMENT_SLUGS)
    const rawTasks: any[] = Array.isArray(parsed?.tasks) ? parsed.tasks.slice(0, 5) : []
    const tasks: PlanTask[] = rawTasks
      .map((t) => ({
        dept: String(t?.dept ?? '').toLowerCase().trim() as BetaDepartmentSlug,
        label: String(t?.label ?? '').trim().slice(0, 200),
        deliverable: String(t?.deliverable ?? '').trim().slice(0, 300),
        depends_on: Array.isArray(t?.depends_on) ? t.depends_on.map(Number).filter(Number.isInteger) : [],
      }))
      .filter((t) => allowed.has(t.dept) && t.label)
    if (tasks.length === 0) return null
    // depends_on may only point at earlier tasks
    tasks.forEach((t, i) => { t.depends_on = t.depends_on.filter((d) => d >= 1 && d <= i) })
    const title = String(parsed?.title ?? '').trim().slice(0, 120) || tasks[0].label
    return { title, tasks }
  } catch {
    return null
  }
}

/** Separates the streamed reply from the JSON trailer in POST /api/chat responses. */
export const TRAILER = '\u0000'

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

/**
 * Streams Orc's reply. Falls back through the Gemini chain only while nothing has been emitted
 * yet, so the founder never sees a half answer replaced by another model's answer.
 */
export async function* streamOrcReply(params: {
  system: string
  history: ChatTurn[]
  apiKey?: string
  models?: string[]
}): AsyncGenerator<string, { model: string; tokens: number }> {
  const apiKey = params.apiKey ?? process.env.GEMINI_API_KEY ?? ''
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const contents = params.history.map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }))

  // Chat wants the first word fast: ask for minimal "thinking". If a model rejects that setting,
  // retry the same model without it (all before anything is shown to the founder).
  const variants: Array<Record<string, unknown>> = [{ thinkingConfig: { thinkingLevel: 'low' } }, {}]
  let lastErr: unknown
  for (const modelName of params.models ?? GEMINI_FALLBACK_CHAIN) {
    for (const extra of variants) {
      let emitted = false
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: params.system,
          generationConfig: { temperature: 0.6, maxOutputTokens: 2048, ...extra } as any,
        })
        const result = await model.generateContentStream({ contents })
        for await (const chunk of result.stream) {
          const text = chunk.text()
          if (text) { emitted = true; yield text }
        }
        const final = await result.response
        return { model: modelName, tokens: final.usageMetadata?.totalTokenCount ?? 0 }
      } catch (err) {
        if (emitted) throw err
        lastErr = err
        // Only a config rejection is worth retrying on the same model; anything else → next model.
        if (!(Object.keys(extra).length > 0 && /400|invalid|unknown|thinking/i.test(String((err as Error)?.message ?? err)))) break
      }
    }
  }
  throw lastErr ?? new Error('No Gemini model available')
}
