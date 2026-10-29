// lib/chat/orc.ts — Orc as a chat assistant.
//
// Most messages: build a small system prompt and stream Gemini's reply. Orc answers, drafts and
// thinks out loud in chat itself. Only when real work is needed does it append a <plan>…</plan>
// block, which the UI shows as a card the founder can run (lib/chat/mission.ts).
// "What can you do?" / "Who are you?" skip the model (capabilityReply). Everything else streams
// from Flash-Lite first, hedged with Flash (streamOrcReply).
// Server-side ONLY.

import { BETA_DEPARTMENT_SLUGS, type BetaDepartmentSlug } from '@/lib/beta-departments'
import { LITE_GEMINI_MODEL, WORKING_GEMINI_MODEL } from '@/lib/gemini-models'
import { validateFacts, type ProposedFact } from '@/lib/facts/facts'

export const DEPARTMENT_CAPABILITIES: Record<BetaDepartmentSlug, string> = {
  marketing: 'positioning, campaigns, social posts, landing-page and email copy, content calendars',
  engineering: 'technical plans, specs, architecture notes, API designs, scripts and code',
  sales: 'pitches, outreach sequences, lead research, pipeline plans, proposals',
  operations: 'processes, checklists, budgets, vendor comparisons, timelines, risk reviews',
}

const DEPARTMENT_LABEL: Record<BetaDepartmentSlug, string> = {
  marketing: 'Marketing',
  engineering: 'Engineering',
  sales: 'Sales',
  operations: 'Operations',
}

/**
 * Identity / capabilities questions have a fixed answer. Gemini 3.8 Flash cannot turn thinking
 * off, so sending these to the model makes the founder wait on a reasoning pass before the
 * first word. Match the whole message only — "what can you do about churn?" is a real ask.
 */
const CAPABILITY_QUESTION =
  /^(?:what (?:can|do) you do(?: for (?:me|us))?|who are you|what are you|how (?:can|do) you help(?: me| us)?|what(?:'s| is) your (?:job|role)|help)$/i

export function isCapabilityQuestion(input: string): boolean {
  return CAPABILITY_QUESTION.test(input.trim().replace(/[.!?\s]+$/g, ''))
}

/** Instant reply for isCapabilityQuestion. No model, no plan, no invented company facts. */
export function capabilityReply(ctx: CompanyContext): string {
  const company = ctx.companyName?.trim()
  const founder = ctx.founderName?.trim()
  const intro = company
    ? `I'm Orc, chief of staff${founder ? ` for ${founder}` : ''} at ${company}.`
    : `I'm Orc, your chief of staff.`
  const team = BETA_DEPARTMENT_SLUGS.map((s) => `- ${DEPARTMENT_LABEL[s]}: ${DEPARTMENT_CAPABILITIES[s]}`)
  return [
    intro,
    '',
    'Right here in chat I can answer questions, give advice, and draft small things — a post, an email, a few bullets — without spinning up a mission.',
    '',
    'When you want a real deliverable, I put a short plan together and the team does the work:',
    ...team,
    '',
    'Nothing is sent, posted, paid, or booked until you approve it. What should we work on?',
  ].join('\n')
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
 * Chat models, fastest first. Flash-Lite with minimal thinking starts talking in well under a
 * second; Flash thinks before its first token. Pro is too slow for chat and is left out.
 */
export const ORC_CHAT_MODELS = Array.from(new Set([LITE_GEMINI_MODEL, WORKING_GEMINI_MODEL]))

/** No first words by then → also ask the next model, in parallel; the first to speak wins. */
export const HEDGE_AFTER_MS = 3_000
/** No first words from any model by then → give up with an error. */
export const FIRST_TOKEN_TIMEOUT_MS = 20_000
/** Longest silence allowed mid-reply. */
export const STREAM_IDLE_TIMEOUT_MS = 20_000
/** Whole reply. Under POST /api/chat's 60s maxDuration so the founder gets an error, not a dead request. */
export const REPLY_DEADLINE_MS = 50_000

class StallError extends Error {}

/** Rejects with StallError (and aborts the request) when `p` does not settle within `ms`. */
function within<T>(p: Promise<T>, ms: number, ac: AbortController, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { ac.abort(); reject(new StallError(`Gemini stalled: no ${what} after ${ms}ms`)) }, Math.max(0, ms))
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

function sleep(ms: number): { done: Promise<'timer'>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  const done = new Promise<'timer'>((resolve) => { timer = setTimeout(() => resolve('timer'), Math.max(0, ms)) })
  return { done, cancel: () => clearTimeout(timer) }
}

/** Lite models can skip thinking ("minimal"); others get "low". Either way, fall back to no setting if rejected. */
function thinkingVariants(modelName: string): Array<Record<string, unknown>> {
  return [{ thinkingConfig: { thinkingLevel: /lite/i.test(modelName) ? 'minimal' : 'low' } }, {}]
}

type ChunkIt = AsyncIterator<{ text(): string }>
interface Opened { model: string; ac: AbortController; it: ChunkIt; response: Promise<any>; first: string; done: boolean }

/** Starts one model and resolves with its first non-empty text (or rejects). */
async function openFirstText(genAI: any, modelName: string, system: string, contents: unknown, ac: AbortController): Promise<Opened> {
  let lastErr: unknown
  for (const extra of thinkingVariants(modelName)) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048, ...extra },
      })
      const result = await model.generateContentStream({ contents }, { signal: ac.signal })
      // A model that loses the race is aborted and its usage promise rejects with nobody awaiting it.
      result.response.catch(() => {})
      const it: ChunkIt = result.stream[Symbol.asyncIterator]()
      for (;;) {
        const step = await it.next()
        if (step.done) throw new Error(`${modelName} returned an empty reply`)
        const text = step.value.text()
        if (text) return { model: modelName, ac, it, response: result.response, first: text, done: false }
      }
    } catch (err) {
      lastErr = err
      // Only a config rejection is worth retrying on the same model; anything else → caller tries another.
      if (!(Object.keys(extra).length > 0 && /400|invalid|unknown|thinking/i.test(String((err as Error)?.message ?? err)))) throw err
    }
  }
  throw lastErr
}

/**
 * Streams Orc's reply as fast as Gemini allows. Starts the first model; if it has not produced
 * words within hedgeMs (Gemini sometimes stalls with no error), the next model is started in
 * parallel and whichever speaks first wins — the other is aborted. A failing model hands over at
 * once. Model choice happens before anything is emitted, so the founder never sees a half answer
 * replaced by another model's answer. Every wait is time-boxed.
 */
export async function* streamOrcReply(params: {
  system: string
  history: ChatTurn[]
  apiKey?: string
  models?: string[]
  hedgeMs?: number
  firstTokenMs?: number
  idleMs?: number
  deadlineMs?: number
}): AsyncGenerator<string, { model: string; tokens: number }> {
  const apiKey = params.apiKey ?? process.env.GEMINI_API_KEY ?? ''
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const models = params.models ?? ORC_CHAT_MODELS
  const hedgeMs = params.hedgeMs ?? HEDGE_AFTER_MS
  const idleMs = params.idleMs ?? STREAM_IDLE_TIMEOUT_MS
  const start = Date.now()
  const deadline = start + (params.deadlineMs ?? REPLY_DEADLINE_MS)
  const firstDeadline = Math.min(deadline, start + (params.firstTokenMs ?? FIRST_TOKEN_TIMEOUT_MS))
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const contents = params.history.map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }))

  // ── Race for the first words ──
  type Outcome = { i: number; ok: true; v: Opened } | { i: number; ok: false; err: unknown }
  const running = new Map<number, { ac: AbortController; p: Promise<Outcome> }>()
  let launched = 0
  let lastErr: unknown
  const launch = () => {
    const i = launched++
    const ac = new AbortController()
    const p = openFirstText(genAI, models[i], params.system, contents, ac)
      .then((v): Outcome => ({ i, ok: true, v }), (err): Outcome => ({ i, ok: false, err }))
    running.set(i, { ac, p })
  }
  const abortAll = () => { for (const r of running.values()) r.ac.abort(); running.clear() }

  let winner: Opened | null = null
  launch()
  while (!winner) {
    if (running.size === 0) {
      if (launched >= models.length) throw lastErr ?? new Error('No Gemini model available')
      launch()
      continue
    }
    const hedge = launched < models.length ? sleep(hedgeMs) : null
    const stop = sleep(firstDeadline - Date.now())
    const out = await Promise.race([...Array.from(running.values()).map((r) => r.p), stop.done.then(() => 'stop' as const), ...(hedge ? [hedge.done] : [])])
    hedge?.cancel(); stop.cancel()
    if (out === 'stop') {
      abortAll()
      throw new StallError(`Gemini stalled: no first token from ${models.slice(0, launched).join(', ')} after ${firstDeadline - start}ms`)
    }
    if (out === 'timer') {
      console.warn(`[streamOrcReply] no words after ${hedgeMs}ms — also asking ${models[launched]}`)
      launch()
      continue
    }
    running.delete(out.i)
    if (out.ok) { winner = out.v; abortAll() }
    else {
      lastErr = out.err
      console.warn(`[streamOrcReply] ${models[out.i]} failed: ${String((out.err as Error)?.message ?? out.err).slice(0, 200)}`)
      if (launched < models.length) launch()
    }
  }

  // ── Stream the winner ──
  yield winner.first
  const ac = winner.ac
  for (;;) {
    const step = await within(winner.it.next(), Math.min(idleMs, deadline - Date.now()), ac, 'new text')
    if (step.done) break
    const text = step.value.text()
    if (text) yield text
  }
  const final = await within(winner.response, Math.min(idleMs, deadline - Date.now()), ac, 'usage').catch(() => null)
  return { model: winner.model, tokens: final?.usageMetadata?.totalTokenCount ?? 0 }
}
