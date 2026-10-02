/**
 * Integration: supabase/migrations/*_crost_beta_baseline.sql against real Postgres,
 * exercised through the app's own query shim (lib/db.ts) and supervisor.
 *
 * Skipped unless TEST_DATABASE_URL is set (empty scratch database).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { Client } from 'pg'

const URL = process.env.TEST_DATABASE_URL
const suite = URL ? describe : describe.skip

const U1 = 'user-one'
const U2 = 'user-two'

let db: any
let supabase: any
let admin: Client

suite('baseline schema + shim (real Postgres)', () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = URL!
    admin = new Client({ connectionString: URL })
    await admin.connect()
    // Stand-ins for what a Supabase project already provides.
    await admin.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
      END $$;
      CREATE SCHEMA IF NOT EXISTS storage;
      CREATE TABLE IF NOT EXISTS storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
    `)
    const dir = path.resolve(__dirname, '../../../supabase/migrations')
    const file = fs.readdirSync(dir).filter((f) => f.endsWith('_crost_beta_baseline.sql'))[0]
    await admin.query(fs.readFileSync(path.join(dir, file), 'utf8'))

    const mod = await import('@/lib/db')
    db = mod
    supabase = mod.createDbClient()
  })

  afterAll(async () => {
    await db?.getPool().end()
    await admin?.end()
  })

  it('seeds the orchestrator + four beta department templates', async () => {
    const { data } = await supabase.from('departments').select('slug, is_orchestrator, activation_stage').is('created_by', null)
    const slugs = data.map((d: any) => d.slug).sort()
    expect(slugs).toEqual(['engineering', 'marketing', 'operations', 'orchestrator', 'sales'])
    expect(data.find((d: any) => d.slug === 'orchestrator').is_orchestrator).toBe(true)
  })

  it('lets two founders each own a copy of the same department slug (per-owner uniqueness)', async () => {
    for (const u of [U1, U2]) {
      const { data: tpl } = await supabase.from('departments').select('*').eq('slug', 'sales').is('created_by', null).single()
      const { error } = await supabase.from('departments').insert({
        name: tpl.name, slug: tpl.slug, persona_prompt: tpl.persona_prompt, capabilities: tpl.capabilities,
        restrictions: tpl.restrictions, tools: tpl.tools, model_provider: tpl.model_provider, model_name: tpl.model_name,
        icon: tpl.icon, color: tpl.color, is_orchestrator: false, created_by: u, orc_persona_id: 'direct_llm:sales',
        activation_stage: 'active', status: 'idle',
      })
      expect(error).toBeNull()
    }
    const { error: dup } = await supabase.from('departments').insert({
      name: 'Sales', slug: 'sales', persona_prompt: 'x'.repeat(60), created_by: U1,
    })
    expect(dup).not.toBeNull() // same owner + slug is rejected
  })

  it('runs the core loop rows: goal → tasks → approval (no department) → event → memo', async () => {
    const { data: goal, error: gErr } = await supabase.from('goals')
      .insert({ title: 'Launch', founder_input: 'Launch our beta', status: 'executing', created_by: U1 })
      .select('id').single()
    expect(gErr).toBeNull()
    const { error: tErr } = await supabase.from('goal_tasks').insert([
      { goal_id: goal.id, task_id: 'a', dept_slug: 'marketing', action: 'draft', label: 'Draft', created_by: U1, status: 'completed' },
      { goal_id: goal.id, task_id: 'b', dept_slug: 'sales', action: 'email', label: 'Email', depends_on: ['a'], created_by: U1, status: 'planned' },
    ])
    expect(tErr).toBeNull()

    const { error: aErr } = await supabase.from('approval_queue').insert({
      goal_id: goal.id, task_id: 'b', user_id: U1, created_by: U1, department_slug: 'sales',
      action_type: 'tool_call', action_label: 'gmail.send_email', payload: { to: 'a@b.com' }, status: 'pending',
    })
    expect(aErr).toBeNull()

    for (const event_type of ['approval_requested', 'tool_executed', 'provider_fallback', 'goal_completed']) {
      const { error } = await supabase.from('event_log').insert({ event_type, description: event_type, goal_id: goal.id, created_by: U1 })
      expect(error).toBeNull() // event types are open-ended
    }

    const { error: mErr } = await supabase.from('company_memos').insert({
      from_department: 'marketing', title: 'Memo', body: 'b', goal_id: goal.id, task_id: 'a', created_by: U1,
      is_current_context: true, is_foundational: false, version_tag: 'v1',
    })
    expect(mErr).toBeNull()
  })

  it('enforces artifact immutability once active, and accepts presentation/pdf types', async () => {
    const { data: art, error } = await supabase.from('artifacts').insert({
      department_slug: 'marketing', artifact_type: 'presentation', title: 'Deck', created_by: U1, status: 'review',
    }).select('id').single()
    expect(error).toBeNull()
    await supabase.from('artifacts').update({ status: 'active' }).eq('id', art.id).eq('created_by', U1)
    const { error: mut } = await supabase.from('artifacts').update({ title: 'Changed' }).eq('id', art.id).eq('created_by', U1)
    expect(mut).not.toBeNull()
    expect(String(mut.message)).toMatch(/immutable/i)
  })

  it('scopes reads by owner', async () => {
    const { data: mine } = await supabase.from('goals').select('id').eq('created_by', U2)
    expect(mine).toEqual([])
    const { data: theirs } = await supabase.from('goals').select('id').eq('created_by', U1)
    expect(theirs.length).toBeGreaterThan(0)
  })

  it('capability_inventory has the columns lib/capability-checker.ts reads', async () => {
    const { data, error } = await supabase.from('capability_inventory').select('capability_slug, availability_status, skill_tags, notes').limit(3)
    expect(error).toBeNull()
    expect(data.length).toBeGreaterThan(0)
    expect(data.every((r: any) => ['available', 'unavailable', 'partial', 'available_with_tools'].includes(r.availability_status))).toBe(true)
  })

  it('the supervisor runs end-to-end against the real schema (releases task b, then closes the goal)', async () => {
    const dispatched: Array<[string, string]> = []
    vi.doMock('@/lib/background', () => ({ triggerDispatch: (g: string, t: string) => dispatched.push([g, t]) }))
    vi.doMock('@/lib/llm-client', () => ({ runOrcReport: vi.fn(async () => {}) }))
    const { runSupervisor } = await import('@/lib/engine/supervisor')

    const first = await runSupervisor()
    expect(first.released).toBe(1) // 'a' completed + memo exists → 'b' released
    expect(dispatched.some(([, t]) => t === 'b')).toBe(true)

    await supabase.from('goal_tasks').update({ status: 'completed' }).eq('task_id', 'b')
    const second = await runSupervisor()
    expect(second.closedGoals).toBe(1)
    const { data: g } = await supabase.from('goals').select('status').eq('created_by', U1).eq('title', 'Launch').single()
    expect(g.status).toBe('completed')
  })

  describe('public API roles (RLS)', () => {
    it('every public table has RLS enabled', async () => {
      const { rows } = await admin.query(
        `SELECT relname FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND NOT relrowsecurity`
      )
      expect(rows).toEqual([])
    })

    it('anon and authenticated cannot read or write app tables', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        for (const sql of ['SELECT * FROM goals', 'SELECT * FROM approval_queue', 'INSERT INTO goals(title,founder_input) VALUES (\'x\',\'y\')', 'SELECT * FROM connections']) {
          await admin.query(`SET ROLE ${role}`)
          const res = await admin.query(sql).then(() => 'ok', (e) => String(e.message))
          await admin.query('RESET ROLE')
          expect(res).toMatch(/permission denied/i)
        }
      }
    })

    it('anon can INSERT into waitlist but cannot read it back', async () => {
      await admin.query('SET ROLE anon')
      const ins = await admin.query(`INSERT INTO waitlist(email) VALUES ('anon@example.com')`).then(() => 'ok', (e) => String(e.message))
      const sel = await admin.query('SELECT * FROM waitlist').then(() => 'ok', (e) => String(e.message))
      await admin.query('RESET ROLE')
      expect(ins).toBe('ok')
      expect(sel).toMatch(/permission denied/i)
    })

    it('creates the private artifacts bucket with a 10MB object cap', async () => {
      const { rows } = await admin.query(`SELECT public, file_size_limit::int AS lim FROM storage.buckets WHERE id='crost'`)
      expect(rows).toEqual([{ public: false, lim: 10485760 }])
    })

    it('has the egress_ledger table, locked to the public API roles', async () => {
      await admin.query(`INSERT INTO egress_ledger(day,label,bytes,calls) VALUES (current_date,'t',1,1)`)
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await admin.query(`SET ROLE ${role}`)
        const res = await admin.query('SELECT * FROM egress_ledger').then(() => 'ok', (e) => String(e.message))
        await admin.query('RESET ROLE')
        expect(res).toMatch(/permission denied/i)
      }
    })
  })
})
