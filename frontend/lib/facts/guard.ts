// lib/facts/guard.ts — checks the figures in a piece of text against the company facts.
//
// Ported from Timbus's guard. Every number, percentage and ISO date in the text is looked up
// among the facts' values after normalising units, so "$2.4m" and "2,400,000" are the same figure
// and a draft cannot dodge the check by restating it. Anything unmatched is "unverified"; any figure
// that appears in a DO NOT CLAIM fact is "prohibited" even if it is also on file elsewhere.
// Years and counts up to 10 are skipped (too common in ordinary prose to be worth a flag).
// It does not judge qualitative claims, and a match proves the figure exists, not that it belongs
// to this claim — so it flags, it never blocks.

import type { CompanyFact } from './facts'

export interface FigureFlag {
  token: string
  context: string
}

export interface FactCheck {
  checked: number
  unverified: FigureFlag[]
  prohibited: Array<FigureFlag & { rule: string }>
}

const MULTIPLIERS: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, mn: 1e6, million: 1e6, bn: 1e9, billion: 1e9,
}

type Found = { token: string; value: number | null; kind: 'number' | 'percent' | 'year' | 'date'; index: number }

export function extractFigures(text: string): Found[] {
  const out: Found[] = []
  // The date alternative must not be able to lose the leftmost-match race to a bare number.
  const re = /(\d{4}-\d{2}-\d{2})|((?:[₦$£€]\s*)?\d(?:[\d,]*\d)?(?:\.\d+)?)\s*(k|m|mn|bn|thousand|million|billion)?\b\s*(%)?/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const [full, iso, num, mult, pct] = m
    if (iso) { out.push({ token: iso, value: null, kind: 'date', index: m.index }); continue }
    if (!num) continue
    const cleaned = num.replace(/[₦$£€,\s]/g, '')
    let value = Number.parseFloat(cleaned)
    if (Number.isNaN(value)) continue
    if (mult) value *= MULTIPLIERS[mult.toLowerCase()] ?? 1
    const kind = pct ? 'percent' : !mult && /^\d{4}$/.test(cleaned) && value >= 1900 && value <= 2100 ? 'year' : 'number'
    out.push({ token: full.trim(), value, kind, index: m.index })
  }
  return out
}

function around(text: string, index: number, len: number): string {
  return text.slice(Math.max(0, index - 40), index + len + 40).replace(/\s+/g, ' ').trim()
}

/**
 * Small counts (1–10) are list numbering, "3 steps", "top 5" — flagging them buries the real
 * signal, so they are only checked against the do-not-claim list.
 */
const TRIVIAL = (f: Found) => f.kind === 'number' && f.value !== null && Number.isInteger(f.value) && f.value >= 0 && f.value <= 10

export function checkFigures(text: string, facts: CompanyFact[]): FactCheck {
  const known = new Set<number>()
  const knownDates = new Set<string>()
  const banned = new Map<number, string>()
  for (const f of facts) {
    for (const n of extractFigures(f.value)) {
      if (f.prohibited) { if (n.value !== null && !banned.has(n.value)) banned.set(n.value, f.value); continue }
      if (n.kind === 'date') knownDates.add(n.token)
      else if (n.value !== null) known.add(n.value)
    }
    if (!f.prohibited && f.as_of) knownDates.add(f.as_of)
  }

  const result: FactCheck = { checked: 0, unverified: [], prohibited: [] }
  const seen = new Set<string>()
  for (const found of extractFigures(text)) {
    const rule = found.value !== null ? banned.get(found.value) : undefined
    if (rule) {
      result.prohibited.push({ token: found.token, context: around(text, found.index, found.token.length), rule })
      continue
    }
    if (TRIVIAL(found) || found.kind === 'year') continue
    result.checked++
    const ok = found.kind === 'date' ? knownDates.has(found.token) : found.value !== null && known.has(found.value)
    if (ok || seen.has(found.token)) continue
    seen.add(found.token)
    result.unverified.push({ token: found.token, context: around(text, found.index, found.token.length) })
  }
  result.unverified = result.unverified.slice(0, 20)
  result.prohibited = result.prohibited.slice(0, 20)
  return result
}
