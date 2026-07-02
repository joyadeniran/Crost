/**
 * Unit tests: lib/db.ts (Cloud SQL Supabase-compatibility shim)
 *
 * Regression coverage for the onboarding-save failure:
 *  - jsonb columns: JS arrays/objects/strings are JSON-encoded (PostgREST parity).
 *    A raw JS array sent to a jsonb column otherwise fails with
 *    "invalid input syntax for type json".
 *  - upsert without onConflict defaults to the table's PRIMARY KEY, not "id".
 *
 * Note: getTableMeta caches per table name for the process lifetime, so each test
 * uses a distinct table name to get an independent metadata fixture.
 */
import { describe, it, expect, vi } from 'vitest'

const queryMock = vi.fn()
vi.mock('pg', () => ({
  // class (not an arrow) so `new Pool()` works
  Pool: class {
    query = queryMock
    on = vi.fn()
  },
}))

// Route the introspection queries to per-call fixtures; everything else returns a row.
function primeMeta(opts: { jsonb?: string[]; pk?: string[] }) {
  const jsonb = opts.jsonb ?? []
  const pk = opts.pk ?? []
  queryMock.mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes("data_type IN ('jsonb', 'json')")) {
      return Promise.resolve({ rows: jsonb.map((column_name) => ({ column_name })) })
    }
    if (typeof sql === 'string' && sql.includes("constraint_type = 'PRIMARY KEY'")) {
      return Promise.resolve({ rows: pk.map((column_name) => ({ column_name })) })
    }
    return Promise.resolve({ rows: [{ id: 'row-1' }] })
  })
}

function lastDataQuery() {
  const calls = queryMock.mock.calls.filter(
    ([sql]) => typeof sql === 'string' && !sql.includes('information_schema') &&
      /INSERT|UPDATE|DELETE/.test(sql)
  )
  return calls[calls.length - 1]
}

describe('db shim — jsonb encoding', () => {
  it('JSON-encodes JS arrays/objects bound for jsonb columns on insert', async () => {
    primeMeta({ jsonb: ['capabilities', 'tools'], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('departments_jsonb_t').insert({
      slug: 'marketing',
      capabilities: ['a', 'b'],
      tools: ['gmail_draft'],
    })

    const [, params] = lastDataQuery()!
    expect(params).toContain('marketing') // plain column untouched
    expect(params).toContain(JSON.stringify(['a', 'b']))
    expect(params).toContain(JSON.stringify(['gmail_draft']))
  })

  it('JSON-encodes raw string values for jsonb columns (e.g. system_config.value)', async () => {
    primeMeta({ jsonb: ['value'], pk: ['key', 'created_by'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('system_config_str_t').upsert({
      key: 'risk_tolerance', value: 'balanced', created_by: 'u1',
    })

    const [, params] = lastDataQuery()!
    expect(params).toContain('"balanced"') // JSON.stringify('balanced')
  })

  it('leaves null jsonb values as SQL NULL (not the string "null")', async () => {
    primeMeta({ jsonb: ['local_identity'], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('company_profile_null_t').insert({ created_by: 'u1', local_identity: null })

    const [, params] = lastDataQuery()!
    expect(params).toContain(null)
    expect(params).not.toContain('null') // not the JSON string
  })
})

describe('db shim — upsert onConflict default', () => {
  it('defaults the conflict target to the table primary key when not specified', async () => {
    primeMeta({ jsonb: [], pk: ['key', 'created_by'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('system_config_pk_t').upsert({
      key: 'founder_name', value: 'Alice', created_by: 'u1',
    })

    const [sql] = lastDataQuery()!
    expect(sql).toMatch(/ON CONFLICT \("key", "created_by"\)/)
    expect(sql).not.toMatch(/ON CONFLICT \("id"\)/)
  })

  it('honors an explicit onConflict target', async () => {
    primeMeta({ jsonb: [], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('company_profile_oc_t').upsert(
      { created_by: 'u1', company_name: 'Acme' },
      { onConflict: 'created_by' }
    )

    const [sql] = lastDataQuery()!
    expect(sql).toMatch(/ON CONFLICT \("created_by"\)/)
  })
})

describe('db shim — upsert guard (atomic claim, Phase 3)', () => {
  it('appends a WHERE guard to the DO UPDATE clause, parameterized after the row values', async () => {
    primeMeta({ jsonb: [], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('goal_tasks_guard_t').upsert(
      { goal_id: 'g1', task_id: 't1', status: 'running' },
      {
        onConflict: 'goal_id,task_id',
        guard: { column: 'status', notIn: ['running', 'completed', 'dispatched', 'skipped', 'rejected'] },
      }
    )

    const [sql, params] = lastDataQuery()!
    expect(sql).toMatch(/DO UPDATE SET .* WHERE "goal_tasks_guard_t"\."status" NOT IN \(\$\d+, \$\d+, \$\d+, \$\d+, \$\d+\)/)
    // Guard values come after the row's own bound values in the params array.
    expect(params.slice(-5)).toEqual(['running', 'completed', 'dispatched', 'skipped', 'rejected'])
  })

  it('emits no WHERE guard when guard is not passed (backward compatible)', async () => {
    primeMeta({ jsonb: [], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('goal_tasks_noguard_t').upsert(
      { goal_id: 'g1', task_id: 't1', status: 'running' },
      { onConflict: 'goal_id,task_id' }
    )

    const [sql] = lastDataQuery()!
    expect(sql).not.toContain('WHERE')
  })
})

describe('db shim — .or() / .not() operator parsing', () => {
  function lastSelect(table: string) {
    const call = queryMock.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.startsWith('SELECT') && sql.includes(`"${table}"`)
    )
    return call as [string, unknown[]]
  }

  it('parameterizes comparison operators in .or() (no raw fragment / syntax error)', async () => {
    primeMeta({ jsonb: [], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')
    const now = '2026-06-11T00:00:00.000Z'

    await createDbClient().from('memos_or_t').select('id').or(`valid_until.is.null,valid_until.gt.${now}`)

    const [sql, params] = lastSelect('memos_or_t')
    expect(sql).toMatch(/"valid_until" IS NULL OR "valid_until" > \$\d+/)
    expect(params).toContain(now) // value bound as a parameter
    expect(sql).not.toContain('2026') // date is NOT inlined into the SQL text
  })

  it('maps .not(col, "cs", val) to a parameterized NOT (@>)', async () => {
    primeMeta({ jsonb: [], pk: ['id'] })
    const { createDbClient } = await import('@/lib/db')

    await createDbClient().from('memos_not_t').select('id').not('read_by', 'cs', '{marketing}')

    const [sql, params] = lastSelect('memos_not_t')
    expect(sql).toMatch(/NOT \("read_by" @> \$\d+\)/)
    expect(params).toContain('{marketing}')
  })
})
