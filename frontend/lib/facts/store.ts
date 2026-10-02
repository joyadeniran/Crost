// lib/facts/store.ts — company_facts persistence. Owner-scoped, explicit columns, bounded reads.
// Server-side ONLY. Raw SQL through the pool (as in POST /api/chats/[id]/run) so a supersede and its
// insert commit together.
//
// A fact is never edited in place: saving a key that already has a live row retires that row
// (active = false, superseded_at) and inserts the new one, so "what did we believe in March" stays
// answerable. Removing a fact retires it the same way.
import { getPool } from '@/lib/db'
import { MAX_FACTS, type CompanyFact, type ProposedFact } from './facts'

const COLUMNS = `id, key, value, to_char(as_of, 'YYYY-MM-DD') AS as_of, source, volatile, prohibited, updated_at`

export async function listFacts(userId: string): Promise<CompanyFact[]> {
  const { rows } = await getPool().query(
    `SELECT ${COLUMNS} FROM company_facts WHERE created_by = $1 AND active ORDER BY key LIMIT ${MAX_FACTS}`,
    [userId]
  )
  return rows as CompanyFact[]
}

/** Saves founder-confirmed facts in one transaction. Same key → the old row is retired. */
export async function saveFacts(userId: string, facts: ProposedFact[], origin: 'chat' | 'settings'): Promise<CompanyFact[]> {
  if (!facts.length) return []
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const saved: CompanyFact[] = []
    for (const f of facts) {
      await client.query(
        `UPDATE company_facts SET active = FALSE, superseded_at = NOW()
          WHERE created_by = $1 AND key = $2 AND active`,
        [userId, f.key]
      )
      const { rows } = await client.query(
        `INSERT INTO company_facts (created_by, key, value, as_of, source, volatile, prohibited, origin)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLUMNS}`,
        [userId, f.key, f.value, f.as_of, f.source, f.volatile, f.prohibited, origin]
      )
      saved.push(rows[0] as CompanyFact)
    }
    await client.query('COMMIT')
    return saved
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Retires one live fact. False when it is not this founder's, or already retired. */
export async function removeFact(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE company_facts SET active = FALSE, superseded_at = NOW()
      WHERE id = $1 AND created_by = $2 AND active`,
    [id, userId]
  )
  return (rowCount ?? 0) > 0
}
