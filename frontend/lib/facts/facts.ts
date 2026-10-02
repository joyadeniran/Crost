// lib/facts/facts.ts — company facts: the founder-confirmed record Orc and the departments draw figures from.
//
// Pattern borrowed from Timbus: every fact carries when it was true (as_of) and where it came from
// (source); figures that move (revenue, users, runway) are `volatile` and go stale after six months;
// a `prohibited` fact is a claim that must never be made again (a retired price, an old figure).
//
// The rule that keeps this trustworthy: only the founder writes facts. Orc may PROPOSE facts the
// founder stated in chat (a <facts> block → a card the founder confirms); department output never
// becomes a fact. Pure helpers only — persistence lives in ./store.ts.

export interface CompanyFact {
  id: string
  key: string
  value: string
  as_of: string | null
  source: string | null
  volatile: boolean
  prohibited: boolean
  updated_at: string
}

export interface ProposedFact {
  key: string
  value: string
  as_of: string | null
  source: string | null
  volatile: boolean
  prohibited: boolean
}

export const MAX_FACTS = 200
export const MAX_PROPOSED = 10
export const STALE_DAYS = 183

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const VOLATILE_HINT = /revenue|mrr|arr|gmv|users|customers|headcount|employees|runway|burn|cash|churn|retention|growth|valuation|signups|orders/i

/** snake_case, ascii, ≤ 60 chars. "Monthly Revenue (USD)" → "monthly_revenue_usd". */
export function normaliseKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

/** Validates one proposed fact from the model or the API. Returns null when unusable. */
export function cleanFact(input: unknown): ProposedFact | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  const key = normaliseKey(String(o.key ?? ''))
  const value = String(o.value ?? '').replace(/\s+/g, ' ').trim().slice(0, 500)
  if (!key || !value) return null
  const asOf = typeof o.as_of === 'string' && DATE_RE.test(o.as_of) ? o.as_of : null
  const source = typeof o.source === 'string' && o.source.trim() ? o.source.trim().slice(0, 200) : null
  const prohibited = o.prohibited === true
  const volatile = !prohibited && (o.volatile === true || (o.volatile === undefined && VOLATILE_HINT.test(key)))
  return { key, value, as_of: asOf, source, volatile, prohibited }
}

/** Parses the JSON inside a <facts> block. De-duplicates by key (last wins), caps the count. */
export function validateFacts(json: string): ProposedFact[] {
  try {
    const start = json.indexOf('[')
    const end = json.lastIndexOf(']')
    if (start === -1 || end <= start) return []
    const parsed = JSON.parse(json.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    const byKey = new Map<string, ProposedFact>()
    for (const raw of parsed.slice(0, MAX_PROPOSED * 2)) {
      const f = cleanFact(raw)
      if (f) byKey.set(f.key, f)
    }
    return Array.from(byKey.values()).slice(0, MAX_PROPOSED)
  } catch {
    return []
  }
}

/** A volatile figure older than six months (or undated) is stale: usable as context, not as a claim. */
export function isStale(f: Pick<CompanyFact, 'volatile' | 'as_of'>, now: Date = new Date()): boolean {
  if (!f.volatile) return false
  if (!f.as_of) return true
  const age = (now.getTime() - new Date(`${f.as_of}T00:00:00Z`).getTime()) / 86_400_000
  return age > STALE_DAYS
}

/** The facts as prompt lines, plus the do-not-claim list. Empty string when there are none. */
export function formatFactsForPrompt(facts: CompanyFact[], now: Date = new Date()): string {
  const live = facts.filter((f) => !f.prohibited)
  const banned = facts.filter((f) => f.prohibited)
  if (!live.length && !banned.length) return ''
  const line = (f: CompanyFact) => {
    const meta = [f.as_of && `as of ${f.as_of}`, f.source && `source: ${f.source}`, isStale(f, now) && 'STALE — confirm before using']
      .filter(Boolean)
      .join('; ')
    return `- ${f.key}: ${f.value}${meta ? ` (${meta})` : ''}`
  }
  const parts: string[] = []
  if (live.length) parts.push(`COMPANY FACTS (confirmed by the founder — the only source for figures):\n${live.map(line).join('\n')}`)
  if (banned.length) parts.push(`DO NOT CLAIM (retired or wrong — never state these):\n${banned.map((f) => `- ${f.value}`).join('\n')}`)
  return parts.join('\n\n')
}
