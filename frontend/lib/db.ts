// lib/db.ts
// PostgreSQL client with Supabase-compatible query builder interface.
// Replaces @supabase/supabase-js for all database operations on Cloud SQL.
// Server-side ONLY.

import { Pool } from 'pg'

let _pool: Pool | null = null

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
    _pool.on('error', (err: any) => console.error('[db] Pool error:', err))
  }
  return _pool
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QResult<T = any> = { data: T | null; error: Error | null; count?: number | null }

class QueryBuilder<T = Record<string, unknown>> {
  private _table: string
  private _cols = '*'
  private _wheres: string[] = []
  private _vals: unknown[] = []
  private _orders: string[] = []
  private _limitN = 1000
  private _isSingle = false
  private _isMaybeSingle = false
  private _insertRows: Partial<T>[] | null = null
  private _updateData: Partial<T> | null = null
  private _upsertRows: Partial<T>[] | null = null
  private _upsertConflict = 'id'
  private _isDelete = false

  constructor(table: string) {
    this._table = table
  }

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this._cols = cols
    if (opts?.count === 'exact') this._isCount = true
    if (opts?.head) this._isHead = true
    return this
  }

  private _isCount = false
  private _isHead = false

  eq(col: string, val: unknown) {
    this._vals.push(val)
    this._wheres.push(`"${col}" = $${this._vals.length}`)
    return this
  }

  neq(col: string, val: unknown) {
    this._vals.push(val)
    this._wheres.push(`"${col}" != $${this._vals.length}`)
    return this
  }

  is(col: string, val: null | boolean) {
    if (val === null) this._wheres.push(`"${col}" IS NULL`)
    else this._wheres.push(`"${col}" IS ${val ? 'TRUE' : 'FALSE'}`)
    return this
  }

  isNot(col: string, _val: null) {
    this._wheres.push(`"${col}" IS NOT NULL`)
    return this
  }

  in(col: string, vals: unknown[]) {
    if (vals.length === 0) { this._wheres.push('FALSE'); return this }
    const placeholders = vals.map((v) => { this._vals.push(v); return `$${this._vals.length}` })
    this._wheres.push(`"${col}" IN (${placeholders.join(', ')})`)
    return this
  }

  contains(col: string, val: unknown) {
    this._vals.push(JSON.stringify(val))
    this._wheres.push(`"${col}" @> $${this._vals.length}::jsonb`)
    return this
  }

  gte(col: string, val: unknown) {
    this._vals.push(val)
    this._wheres.push(`"${col}" >= $${this._vals.length}`)
    return this
  }

  lte(col: string, val: unknown) {
    this._vals.push(val)
    this._wheres.push(`"${col}" <= $${this._vals.length}`)
    return this
  }

  gt(col: string, val: unknown) {
    this._vals.push(val)
    this._wheres.push(`"${col}" > $${this._vals.length}`)
    return this
  }

  lt(col: string, val: unknown) {
    this._vals.push(val)
    this._wheres.push(`"${col}" < $${this._vals.length}`)
    return this
  }

  like(col: string, pattern: string) {
    this._vals.push(pattern)
    this._wheres.push(`"${col}" LIKE $${this._vals.length}`)
    return this
  }

  ilike(col: string, pattern: string) {
    this._vals.push(pattern)
    this._wheres.push(`"${col}" ILIKE $${this._vals.length}`)
    return this
  }

  // Parse Supabase-style filter string: "col.op.val,col2.op2.val2"
  or(filterStr: string) {
    const parts = filterStr.split(',').map(f => f.trim())
    const clauses: string[] = []
    for (const part of parts) {
      const dotIdx = part.indexOf('.')
      const rest = part.slice(dotIdx + 1)
      const dotIdx2 = rest.indexOf('.')
      const col = part.slice(0, dotIdx)
      const op = rest.slice(0, dotIdx2 < 0 ? rest.length : dotIdx2)
      const val = dotIdx2 < 0 ? '' : rest.slice(dotIdx2 + 1)

      if (op === 'eq') {
        this._vals.push(val)
        clauses.push(`"${col}" = $${this._vals.length}`)
      } else if (op === 'is' && val === 'null') {
        clauses.push(`"${col}" IS NULL`)
      } else if (op === 'ilike') {
        this._vals.push(val)
        clauses.push(`"${col}" ILIKE $${this._vals.length}`)
      } else if (op === 'in') {
        const listStr = val.replace(/^\(/, '').replace(/\)$/, '')
        const items = listStr.split(',').map(s => s.trim())
        const phs = items.map(v => { this._vals.push(v); return `$${this._vals.length}` })
        clauses.push(`"${col}" IN (${phs.join(', ')})`)
      } else if (op === 'not') {
        // handle not.in.(...)
        const subRest = val
        const subDot = subRest.indexOf('.')
        const subOp = subRest.slice(0, subDot < 0 ? subRest.length : subDot)
        const subVal = subDot < 0 ? '' : subRest.slice(subDot + 1)
        if (subOp === 'in') {
          const listStr = subVal.replace(/^\(/, '').replace(/\)$/, '')
          const items = listStr.split(',').map(s => s.trim())
          const phs = items.map(v => { this._vals.push(v); return `$${this._vals.length}` })
          clauses.push(`"${col}" NOT IN (${phs.join(', ')})`)
        } else {
          clauses.push(`NOT "${col}"`)
        }
      } else {
        // Fallback: treat as raw SQL fragment
        clauses.push(part)
      }
    }
    if (clauses.length) {
      this._wheres.push(`(${clauses.join(' OR ')})`)
    }
    return this
  }

  not(col: string, op: string, val: unknown) {
    if (op === 'is' && val === null) {
      this._wheres.push(`"${col}" IS NOT NULL`)
    } else if (op === 'in') {
      const listStr = String(val).replace(/^\(/, '').replace(/\)$/, '')
      const items = listStr.split(',').map(s => s.trim())
      const phs = items.map(v => { this._vals.push(v); return `$${this._vals.length}` })
      this._wheres.push(`"${col}" NOT IN (${phs.join(', ')})`)
    } else if (op === 'eq') {
      this._vals.push(val)
      this._wheres.push(`"${col}" != $${this._vals.length}`)
    } else {
      this._vals.push(val)
      this._wheres.push(`NOT "${col}" ${op.toUpperCase()} $${this._vals.length}`)
    }
    return this
  }

  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const dir = opts.ascending === false ? 'DESC' : 'ASC'
    const nulls = opts.nullsFirst ? 'NULLS FIRST' : ''
    this._orders.push(`"${col}" ${dir} ${nulls}`.trim())
    return this
  }

  limit(n: number) { this._limitN = Math.min(n, 10_000); return this }

  single() { this._isSingle = true; return this }
  maybeSingle() { this._isMaybeSingle = true; return this }

  insert(data: Partial<T> | Partial<T>[]) {
    this._insertRows = Array.isArray(data) ? data : [data]
    return this
  }

  update(data: Partial<T>) { this._updateData = data; return this }

  upsert(data: Partial<T> | Partial<T>[], opts: { onConflict?: string } = {}) {
    this._upsertRows = Array.isArray(data) ? data : [data]
    this._upsertConflict = opts.onConflict ?? 'id'
    return this
  }

  delete() { this._isDelete = true; return this }

  private whereClause() {
    return this._wheres.length ? `WHERE ${this._wheres.join(' AND ')}` : ''
  }

  private orderClause() {
    return this._orders.length ? `ORDER BY ${this._orders.join(', ')}` : ''
  }

  private adjustedWhere(offset: number): { clause: string } {
    const adjusted = this._wheres.map(w =>
      w.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + offset}`)
    )
    return { clause: adjusted.length ? `WHERE ${adjusted.join(' AND ')}` : '' }
  }

  async _run(): Promise<QResult<unknown>> {
    const pool = getPool()
    try {
      // INSERT
      if (this._insertRows) {
        const results: unknown[] = []
        for (const row of this._insertRows) {
          const cols = Object.keys(row as object)
          if (cols.length === 0) continue
          const placeholders = cols.map((_, i) => `$${i + 1}`)
          const vals = cols.map(c => (row as any)[c])
          const sql = `INSERT INTO "${this._table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`
          const r = await pool.query(sql, vals)
          results.push(r.rows[0])
        }
        if (this._isSingle || this._isMaybeSingle) return { data: results[0] ?? null, error: null }
        return { data: results, error: null }
      }

      // UPSERT
      if (this._upsertRows) {
        const results: unknown[] = []
        for (const row of this._upsertRows) {
          const cols = Object.keys(row as object)
          if (cols.length === 0) continue
          const placeholders = cols.map((_, i) => `$${i + 1}`)
          const vals = cols.map(c => (row as any)[c])
          const conflictCols = this._upsertConflict.split(',').map(s => s.trim())
          const updateCols = cols.filter(c => !conflictCols.includes(c))
          const updateSet = updateCols.length
            ? `DO UPDATE SET ${updateCols.map(c => `"${c}" = EXCLUDED."${c}"`).join(', ')}`
            : 'DO NOTHING'
          const sql = `INSERT INTO "${this._table}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictCols.map(c => `"${c}"`).join(', ')}) ${updateSet} RETURNING *`
          const r = await pool.query(sql, vals)
          results.push(r.rows[0])
        }
        if (this._isSingle || this._isMaybeSingle) return { data: results[0] ?? null, error: null }
        return { data: results, error: null }
      }

      // UPDATE
      if (this._updateData) {
        const cols = Object.keys(this._updateData as object)
        const setClause = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
        const vals = cols.map(c => (this._updateData as any)[c])
        const { clause } = this.adjustedWhere(cols.length)
        const sql = `UPDATE "${this._table}" SET ${setClause} ${clause} RETURNING *`
        const r = await pool.query(sql, [...vals, ...this._vals])
        return { data: r.rows, error: null }
      }

      // DELETE
      if (this._isDelete) {
        const sql = `DELETE FROM "${this._table}" ${this.whereClause()} RETURNING *`
        const r = await pool.query(sql, this._vals)
        return { data: r.rows, error: null }
      }

      // SELECT (with optional COUNT)
      if (this._isCount) {
        const countSql = `SELECT COUNT(*) FROM "${this._table}" ${this.whereClause()}`
        const cr = await pool.query(countSql, this._vals)
        return { data: this._isHead ? null : [], error: null, count: parseInt(cr.rows[0].count, 10) }
      }

      const sql = `SELECT ${this._cols} FROM "${this._table}" ${this.whereClause()} ${this.orderClause()} LIMIT ${this._limitN}`
      const r = await pool.query(sql, this._vals)
      if (this._isSingle) {
        if (r.rows.length === 0) return { data: null, error: new Error('No rows found') }
        return { data: r.rows[0], error: null }
      }
      if (this._isMaybeSingle) return { data: r.rows[0] ?? null, error: null }
      return { data: r.rows, error: null }
    } catch (err) {
      console.error(`[db] Query error on "${this._table}":`, err)
      return { data: null, error: err as Error }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then<TResult1 = QResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QResult<any>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._run().then(onfulfilled, onrejected)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(fn: string, params: Record<string, unknown> = {}): Promise<QResult<any>> {
  const pool = getPool()
  try {
    const keys = Object.keys(params)
    if (keys.length === 0) {
      const r = await pool.query(`SELECT * FROM "${fn}"()`)
      return { data: r.rows, error: null }
    }
    const argList = keys.map((k, i) => `${k} => $${i + 1}`).join(', ')
    const vals = keys.map(k => params[k])
    const r = await pool.query(`SELECT * FROM "${fn}"(${argList})`, vals)
    return { data: r.rows, error: null }
  } catch (err) {
    console.error(`[db] RPC error on "${fn}":`, err)
    return { data: null, error: err as Error }
  }
}

export function createDbClient() {
  return {
    from: <T = Record<string, unknown>>(table: string) => new QueryBuilder<T>(table),
    rpc,
  }
}
