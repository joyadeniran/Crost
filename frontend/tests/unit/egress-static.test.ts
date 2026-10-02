// Egress regression guard: `select('*')` ships every column (incl. large bodies) over the pooler.
// New or additional occurrences fail this test — list the explicit columns instead (see
// lib/egress-columns.ts). The baseline (select-star-baseline.json) may only shrink; when you remove
// a `select('*')`, lower its count (or delete the entry).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import baseline from './select-star-baseline.json'

const ROOT = path.resolve(__dirname, '../..')
const RE = /select\(\s*(['"])\*\1/g

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

describe('egress: select(*) baseline', () => {
  const found: Record<string, number> = {}
  for (const dir of ['app', 'lib']) {
    for (const f of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, f).split(path.sep).join('/')
      if (rel === 'lib/db.ts') continue
      const n = (fs.readFileSync(f, 'utf8').match(RE) ?? []).length
      if (n) found[rel] = n
    }
  }

  it('does not add new select(*) calls', () => {
    const base = baseline as Record<string, number>
    const regressions = Object.entries(found).filter(([f, n]) => n > (base[f] ?? 0))
    expect(regressions).toEqual([])
  })

  it('list endpoints that carry bodies use explicit columns', () => {
    const art = fs.readFileSync(path.join(ROOT, 'app/api/artifacts/route.ts'), 'utf8')
    expect(art).toContain('ARTIFACT_LIST_COLUMNS')
    expect(found['app/api/artifacts/route.ts'] ?? 0).toBe(0)
  })
})
