/**
 * Unit tests: app/api/departments/generate-prompt/route.ts — POST.
 *
 * Auto-generates a department persona prompt + capabilities/restrictions so
 * founders don't have to hand-write a 50+ char persona when creating a
 * custom department.
 *
 * Contract:
 *  - Session auth required (401 without a user).
 *  - Happy path returns { persona_prompt, capabilities, restrictions } with
 *    persona_prompt >= 50 chars (matches the CreateSchema minimum).
 *  - The LLM prompt includes the department name and company profile context.
 *  - JSON wrapped in preamble/fences is salvaged.
 *  - Unparseable LLM output → 502, never a 500 crash.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockUser: { id: string } | null = { id: 'user-1' }
let mockCompanyMemo: any = {
  company_profile: { name: 'Supplya', industry: 'B2B commerce', description: 'Inventory credit for informal retailers' },
}

const { callLLMMock, getModelMock } = vi.hoisted(() => ({
  callLLMMock: vi.fn(),
  getModelMock: vi.fn(async () => ({ model: 'gemini/gemini-2.5-flash' })),
}))

vi.mock('@/lib/llm-client', () => ({
  callLLM: (...args: any[]) => callLLMMock(...args),
  getModel: (...args: any[]) => getModelMock(...args),
}))

vi.mock('@/lib/supabase', () => ({
  createSupabaseServerComponentClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })) },
  })),
  createServerSupabaseClient: vi.fn(() => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: mockCompanyMemo, error: null })),
    }
    return { from: vi.fn(() => builder) }
  }),
}))

import { POST } from '@/app/api/departments/generate-prompt/route'

const VALID_LLM_JSON = JSON.stringify({
  persona_prompt:
    'You are the Growth department lead for Supplya. You own experiments across acquisition and retention. Work from company memos and prior task outputs; never invent metrics. Produce structured, actionable deliverables with clear next steps.',
  capabilities: ['Design growth experiments', 'Analyze funnel metrics', 'Draft campaign briefs'],
  restrictions: ['Never commit spend without approval', 'Never contact customers directly'],
})

function makeReq(body: any) {
  return new NextRequest('http://localhost/api/departments/generate-prompt', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  mockUser = { id: 'user-1' }
  callLLMMock.mockReset()
  getModelMock.mockClear()
})

describe('POST /api/departments/generate-prompt', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUser = null
    const res = await POST(makeReq({ name: 'Growth' }))
    expect(res.status).toBe(401)
  })

  it('generates persona + capabilities + restrictions from name and company context', async () => {
    callLLMMock.mockResolvedValueOnce({ content: VALID_LLM_JSON })

    const res = await POST(makeReq({ name: 'Growth', description: 'Owns acquisition and retention experiments' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.data.persona_prompt.length).toBeGreaterThanOrEqual(50)
    expect(body.data.capabilities.length).toBeGreaterThan(0)
    expect(body.data.restrictions.length).toBeGreaterThan(0)

    // The generation prompt must carry the dept name and company profile
    const [, promptArg] = callLLMMock.mock.calls[0]
    expect(promptArg).toContain('Growth')
    expect(promptArg).toContain('Supplya')
  })

  it('salvages JSON wrapped in preamble or fences', async () => {
    callLLMMock.mockResolvedValueOnce({ content: '```json\n' + VALID_LLM_JSON + '\n```' })
    const res = await POST(makeReq({ name: 'Growth' }))
    expect(res.status).toBe(200)
  })

  it('returns 502 when the LLM output is unusable', async () => {
    callLLMMock.mockResolvedValueOnce({ content: 'I cannot help with that.' })
    const res = await POST(makeReq({ name: 'Growth' }))
    expect(res.status).toBe(502)
  })

  it('validates input (400 for missing name)', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })
})
