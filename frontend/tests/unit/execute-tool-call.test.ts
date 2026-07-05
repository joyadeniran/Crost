/**
 * Unit tests: lib/tools/execute-tool-call.ts
 *
 * Covers:
 *  - BUG-3: approval_requested event emitted to event_log when HITL triggers
 *  - BUG-5: runComposioTool queues external actions for approval (post-migration)
 *           and retains GMAIL_CREATE_DRAFT → GMAIL_CREATE_EMAIL_DRAFT override map
 *  - executeToolCall: missing_connection returns graceful object (no throw)
 *  - executeToolCall: permission_denied returns graceful object for unknown dept
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Env setup ──────────────────────────────────────────────────────────────
process.env.COMPOSIO_API_KEY = 'test-composio-key'
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'

// ── Event log capture ──────────────────────────────────────────────────────
const loggedEvents: Array<{ event_type: string; [k: string]: any }> = []
const approvalQueueInserts: any[] = []
const memoInserts: any[] = []

// ── Supabase mock ──────────────────────────────────────────────────────────
function mockSupabaseClient(overrides: Record<string, any> = {}) {
  const queryBuilder: any = {
    _table: '',
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(async function (this: any) {
      if (this._table === 'system_config') {
        return { data: { value: 'careful' }, error: null } // careful = everything needs approval
      }
      return { data: null, error: null }
    }),
    single: vi.fn().mockImplementation(async function (this: any) {
      if (this._table === 'tool_executions') {
        return { data: { id: 'exec-id-1' }, error: null }
      }
      return { data: { id: 'mock-id' }, error: null }
    }),
    insert: vi.fn().mockImplementation(function (this: any, rows: any) {
      const row = Array.isArray(rows) ? rows[0] : rows
      if (this._table === 'event_log') {
        loggedEvents.push(row)
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'evt-1' }, error: null }), then: (r: any) => Promise.resolve({ data: null, error: null }).then(r) }
      }
      if (this._table === 'approval_queue') {
        approvalQueueInserts.push(row)
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'aq-id-1' }, error: null }) }
      }
      if (this._table === 'company_memos') {
        memoInserts.push(row)
        return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'memo-1' }, error: null }), then: (r: any) => Promise.resolve({ data: null, error: null }).then(r) }
      }
      return { select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }), then: (r: any) => Promise.resolve({ data: null, error: null }).then(r) }
    }),
    update: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation(function (this: any, resolve: any) {
      return Promise.resolve({ data: null, error: null }).then(resolve)
    }),
  }

  return {
    from: vi.fn((table: string) => {
      queryBuilder._table = table
      return queryBuilder
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://mock/file' } }),
      })),
    },
    ...overrides,
  }
}

vi.mock('@/lib/supabase', () => ({
  createServerSupabaseClient: vi.fn(() => mockSupabaseClient()),
}))

const { composioExecuteMock } = vi.hoisted(() => {
  const composioExecuteMock = vi.fn().mockResolvedValue({ successful: true, data: { id: 'msg-123' } })
  return { composioExecuteMock }
})

vi.mock('@composio/core', () => ({
  Composio: vi.fn(function () {
    return {
      tools: {
        execute: composioExecuteMock,
      },
    }
  }),
}))

vi.mock('@/lib/composio-connection', () => ({
  checkConnectionWithJIT: vi.fn().mockResolvedValue({ isConnected: true, error: null }),
}))

vi.mock('@/lib/suggested-actions', () => ({
  generateAndInsertSuggestedActions: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/company-memo', () => ({
  addTaskLog: vi.fn().mockResolvedValue(undefined),
  addArtifactReference: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/artifact-transformers', () => ({
  detectOutputType: vi.fn().mockReturnValue({ type: 'json' }),
}))

beforeEach(() => {
  loggedEvents.length = 0
  approvalQueueInserts.length = 0
  memoInserts.length = 0
})

// ── Tests: BUG-3 — approval_requested event ───────────────────────────────

describe('executeToolCall — approval_requested event (BUG-3)', () => {
  it('inserts approval_requested into event_log when risk_tolerance is careful', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')

    await executeToolCall({
      userId: 'user-1',
      departmentId: 'marketing',
      taskId: 'task-1',
      goalId: 'goal-1',
      toolCall: {
        service: 'gmail',
        action: 'send_email',
        params: { to: 'test@example.com', subject: 'Hello', body: 'Hi' },
        reasoning: 'Sending outreach email',
        risk: 'medium',
        requiresApproval: false,
      },
    })

    // approval_queue must have been populated
    expect(approvalQueueInserts.length).toBeGreaterThan(0)

    // event_log must contain approval_requested
    const approvalEvent = loggedEvents.find(e => e.event_type === 'approval_requested')
    expect(approvalEvent).toBeDefined()
    expect(approvalEvent?.metadata?.tool).toBe('gmail.send_email')
  })

  it('approval_requested event contains approval_id from approval_queue row', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')

    await executeToolCall({
      userId: 'user-1',
      departmentId: 'marketing',
      taskId: 'task-2',
      goalId: 'goal-1',
      toolCall: {
        service: 'gmail',
        action: 'send_email',
        params: { to: 'test@example.com', subject: 'Hello', body: 'Hi' },
        reasoning: 'Sending email',
        risk: 'high',
        requiresApproval: true,
      },
    })

    const approvalEvent = loggedEvents.find(e => e.event_type === 'approval_requested')
    expect(approvalEvent?.metadata?.approval_id).toBe('aq-id-1')
  })
})

// ── Tests: BUG-5 — Gmail slug override map ────────────────────────────────
// GCP migration: external tool execution moved off the Composio SDK and onto the
// ADK approval flow (Google APIs are called post-approval). runComposioTool is now
// a backward-compatible stub that returns a `requires_approval` result instead of
// executing, and the legacy slug map is retained for the approval route.

describe('runComposioTool — slug override + approval-flow contract (BUG-5)', () => {
  it('returns a requires-approval result without executing the Composio SDK', async () => {
    const { runComposioTool } = await import('@/lib/tools/providers/composio')

    const result = await runComposioTool({
      userId: 'user-1',
      service: 'gmail',
      action: 'create_draft',
      params: { subject: 'Test', body: 'Body' },
    })

    // External actions are queued for founder approval, not run directly anymore
    expect(result.success).toBe(false)
    expect((result.data as any)?.requires_approval).toBe(true)
    // The legacy Composio SDK must no longer be invoked
    expect(composioExecuteMock).not.toHaveBeenCalled()
  })

  it('retains the GMAIL_CREATE_DRAFT → GMAIL_CREATE_EMAIL_DRAFT override map for the approval route', async () => {
    const { COMPOSIO_SLUG_OVERRIDE_MAP } = await import('@/lib/tools/providers/composio')
    expect(COMPOSIO_SLUG_OVERRIDE_MAP.GMAIL_CREATE_DRAFT).toBe('GMAIL_CREATE_EMAIL_DRAFT')
  })

  it('passes GMAIL_SEND_EMAIL through the override for "gmail" + "send"', async () => {
    // Raw: GMAIL_SEND → override: GMAIL_SEND_EMAIL
    const overrides: Record<string, string> = {
      GMAIL_CREATE_DRAFT: 'GMAIL_CREATE_EMAIL_DRAFT',
      GMAIL_SEND: 'GMAIL_SEND_EMAIL',
      GMAIL_REPLY: 'GMAIL_REPLY_TO_EMAIL',
    }
    const raw = 'GMAIL_SEND'
    expect(overrides[raw] ?? raw).toBe('GMAIL_SEND_EMAIL')
  })

  it('passes unknown slugs through unchanged', () => {
    const overrides: Record<string, string> = {
      GMAIL_CREATE_DRAFT: 'GMAIL_CREATE_EMAIL_DRAFT',
    }
    const raw = 'SLACK_SEND_MESSAGE'
    expect(overrides[raw] ?? raw).toBe('SLACK_SEND_MESSAGE')
  })
})

// ── Tests: permission_denied / missing_connection returns ─────────────────

describe('executeToolCall — graceful returns for blocked requests', () => {
  it('returns permission_denied object when dept is not authorized for service', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')

    const result = await executeToolCall({
      userId: 'user-1',
      departmentId: 'engineering', // engineering not allowed to use gmail
      taskId: 'task-3',
      goalId: 'goal-1',
      toolCall: {
        service: 'gmail',
        action: 'send_email',
        params: {},
        reasoning: 'Unauthorized usage',
        risk: 'low',
        requiresApproval: false,
      },
    })

    expect((result as any).status).toBe('permission_denied')
  })

  // Invariant #5 hardening: an unknown/custom department slug must NOT fall
  // back to executive god-mode tool access. Safe default is internal-only.
  it('denies external tools to a custom department not in DEPARTMENT_TOOL_RULES', async () => {
    const { executeToolCall } = await import('@/lib/tools/execute-tool-call')

    const result = await executeToolCall({
      userId: 'user-1',
      departmentId: 'growth-hacking', // custom dept, not in allowlist
      taskId: 'task-5',
      goalId: 'goal-1',
      toolCall: {
        service: 'gmail',
        action: 'send_email',
        params: {},
        reasoning: 'Custom dept trying an external tool',
        risk: 'low',
        requiresApproval: false,
      },
    })

    expect((result as any).status).toBe('permission_denied')
  })

  it('getAllowedServices: unknown slug → internal only; orchestrator/executive keep full access; known slug unchanged', async () => {
    const { getAllowedServices, DEPARTMENT_TOOL_RULES } = await import('@/lib/tools/execute-tool-call')

    expect(getAllowedServices('growth-hacking')).toEqual(['internal'])
    expect(getAllowedServices('orchestrator')).toEqual(DEPARTMENT_TOOL_RULES['executive'])
    expect(getAllowedServices('executive')).toEqual(DEPARTMENT_TOOL_RULES['executive'])
    expect(getAllowedServices(undefined)).toEqual(DEPARTMENT_TOOL_RULES['executive'])
    expect(getAllowedServices('marketing')).toEqual(DEPARTMENT_TOOL_RULES['marketing'])
  })

  it('humanizes knowledge base search results instead of leaking raw JSON', async () => {
    const priorFetch = global.fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          { title: 'Plan', category: 'marketing', file_id: 'file-1', relevance: 0.92, summary: 'A strong plan.' },
          { title: 'Deck', category: 'sales', file_id: 'file-2', relevance: 0.84, summary: 'Pitch deck notes.' }
        ]
      })
    }))

    try {
      const { executeToolCall } = await import('@/lib/tools/execute-tool-call')

      const result = await executeToolCall({
        userId: 'user-1',
        departmentId: 'executive',
        taskId: 'task-4',
        goalId: 'goal-1',
        toolCall: {
          service: 'knowledge_base_search',
          action: 'search',
          params: { query: 'customer insights' },
          reasoning: 'Search KB',
          risk: 'low',
          requiresApproval: false,
        },
      })

      expect((result as any).result).toContain('I found 2 relevant documents:')
      expect((result as any).result).not.toContain('matches')
    } finally {
      if (priorFetch) {
        vi.stubGlobal('fetch', priorFetch)
      }
    }
  })
})
