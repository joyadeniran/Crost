/**
 * Unit tests: lib/tools/execute-tool-call.ts (beta approval gateway)
 *
 * Covers:
 *  - Every external tool call is blocked behind an approval — there is NO
 *    auto-run path, regardless of risk level or `requiresApproval` input.
 *  - approval_requested event is emitted to event_log (BUG-3).
 *  - Department permission mask: unknown departments are internal-only.
 *  - getAllowedServices resolution rules.
 *  - Failed approval insert rolls the execution skeleton back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const loggedEvents: Array<{ event_type: string; [k: string]: any }> = []
const approvalQueueInserts: any[] = []
const executionInserts: any[] = []
const executionUpdates: any[] = []
const memoInserts: any[] = []
let approvalInsertError: { message: string } | null = null

function builder() {
  const qb: any = { _table: '', _op: '' }
  qb.select = vi.fn(() => qb)
  qb.eq = vi.fn(() => qb)
  qb.insert = vi.fn((rows: any) => {
    const row = Array.isArray(rows) ? rows[0] : rows
    qb._op = 'insert'
    if (qb._table === 'event_log') loggedEvents.push(row)
    if (qb._table === 'approval_queue') approvalQueueInserts.push(row)
    if (qb._table === 'tool_executions') executionInserts.push(row)
    if (qb._table === 'company_memos') memoInserts.push(row)
    return qb
  })
  qb.update = vi.fn((row: any) => {
    qb._op = 'update'
    if (qb._table === 'tool_executions') executionUpdates.push(row)
    return qb
  })
  qb.single = vi.fn(async () => {
    if (qb._table === 'approval_queue' && approvalInsertError) return { data: null, error: approvalInsertError }
    if (qb._table === 'approval_queue') return { data: { id: 'aq-id-1' }, error: null }
    if (qb._table === 'tool_executions') return { data: { id: 'exec-id-1' }, error: null }
    return { data: { id: 'mock-id' }, error: null }
  })
  qb.then = (resolve: any) => Promise.resolve({ data: null, error: null }).then(resolve)
  return qb
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const qb = builder()
      qb._table = table
      return qb
    }),
  })),
}))

beforeEach(() => {
  loggedEvents.length = 0
  approvalQueueInserts.length = 0
  executionInserts.length = 0
  executionUpdates.length = 0
  memoInserts.length = 0
  approvalInsertError = null
})

const gmailSend = {
  service: 'gmail',
  action: 'send_email',
  params: { to: 'a@b.com', subject: 'Hi', body: 'Hello' },
  reasoning: 'Founder asked for an intro email',
  risk: 'medium' as const,
  requiresApproval: false, // must be ignored — beta has no auto-run
}

describe('executeToolCall — approval gate (no auto-run)', () => {
  it('blocks a low-risk call behind an approval even when requiresApproval=false', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    const result: any = await executeToolCall({
      userId: 'user-1', departmentId: 'marketing', taskId: 't1', goalId: 'g1',
      toolCall: { ...gmailSend, risk: 'low' },
    })
    expect(result.status).toBe('requires_approval')
    expect(result.approval_id).toBe('aq-id-1')
    expect(executionInserts[0]).toMatchObject({ status: 'blocked', requires_approval: true, user_id: 'user-1' })
  })

  it('writes an owner-scoped pending approval row with the real action stashed in the payload', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    await executeToolCall({ userId: 'user-1', departmentId: 'sales', taskId: 't1', goalId: 'g1', toolCall: gmailSend })
    expect(approvalQueueInserts).toHaveLength(1)
    expect(approvalQueueInserts[0]).toMatchObject({
      created_by: 'user-1', user_id: 'user-1', status: 'pending', action_type: 'tool_call', goal_id: 'g1',
    })
    expect(approvalQueueInserts[0].payload.__service).toBe('gmail')
    expect(approvalQueueInserts[0].payload.__tool_action).toBeTruthy()
  })

  it('emits approval_requested to event_log (BUG-3) and a paper-trail memo', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    await executeToolCall({ userId: 'user-1', departmentId: 'marketing', taskId: 't1', goalId: 'g1', toolCall: gmailSend })
    const evt = loggedEvents.find((e) => e.event_type === 'approval_requested')
    expect(evt).toBeDefined()
    expect(evt!.metadata.approval_id).toBe('aq-id-1')
    expect(memoInserts[0]).toMatchObject({ created_by: 'user-1', tags: ['system', 'tool_approval'] })
  })

  it('escalates known-critical tools to critical risk regardless of caller input', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    await executeToolCall({
      userId: 'user-1', departmentId: 'executive', taskId: 't1', goalId: null,
      toolCall: { ...gmailSend, action: 'delete_email', risk: 'low' },
    })
    expect(approvalQueueInserts[0].risk_level).toBe('critical')
  })

  it('rolls the execution skeleton back to failed when the approval insert fails', async () => {
    approvalInsertError = { message: 'boom' }
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    await expect(
      executeToolCall({ userId: 'user-1', departmentId: 'marketing', taskId: 't1', goalId: 'g1', toolCall: gmailSend })
    ).rejects.toThrow(/Failed to create approval request/)
    expect(executionUpdates.some((u) => u.status === 'failed')).toBe(true)
  })
})

describe('executeToolCall — department permission mask', () => {
  it('denies external tools to a department not in DEPARTMENT_TOOL_RULES', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    const result: any = await executeToolCall({
      userId: 'user-1', departmentId: 'growth-hacking', taskId: 't1', goalId: 'g1', toolCall: gmailSend,
    })
    expect(result.status).toBe('permission_denied')
    expect(approvalQueueInserts).toHaveLength(0)
    expect(executionInserts).toHaveLength(0)
  })

  it('denies services outside the department allowlist (engineering has no gmail)', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')
    const result: any = await executeToolCall({
      userId: 'user-1', departmentId: 'engineering', taskId: 't1', goalId: 'g1', toolCall: gmailSend,
    })
    expect(result.status).toBe('permission_denied')
  })
})

describe('getAllowedServices', () => {
  it('unknown slug → internal only; orchestrator/executive/undefined → executive set; known slug unchanged', async () => {
    const { getAllowedServices, DEPARTMENT_TOOL_RULES } = await import('@/lib/tools/execute-tool-call')
    expect(getAllowedServices('growth-hacking')).toEqual(['internal'])
    expect(getAllowedServices('orchestrator')).toEqual(DEPARTMENT_TOOL_RULES['executive'])
    expect(getAllowedServices('executive')).toEqual(DEPARTMENT_TOOL_RULES['executive'])
    expect(getAllowedServices(undefined)).toEqual(DEPARTMENT_TOOL_RULES['executive'])
    expect(getAllowedServices('marketing')).toEqual(DEPARTMENT_TOOL_RULES['marketing'])
  })

  it('covers exactly the four beta departments', async () => {
    const { DEPARTMENT_TOOL_RULES } = await import('@/lib/tools/execute-tool-call')
    expect(Object.keys(DEPARTMENT_TOOL_RULES).sort()).toEqual(['engineering', 'executive', 'marketing', 'operations', 'sales'])
  })
})
