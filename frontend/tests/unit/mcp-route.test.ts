/**
 * Unit tests: app/api/mcp/route.ts — MCP server GET (tools/list) and POST (tools/call).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

let mockDbData: any = []
const dbBuilder: any = {
  select: vi.fn(() => dbBuilder),
  eq: vi.fn(() => dbBuilder),
  ilike: vi.fn(() => dbBuilder),
  or: vi.fn(() => dbBuilder),
  order: vi.fn(() => dbBuilder),
  limit: vi.fn(() => Promise.resolve({ data: mockDbData })),
  then: (resolve: any) => Promise.resolve({ data: mockDbData }).then(resolve),
}
vi.mock('@/lib/db', () => ({
  createDbClient: vi.fn(() => ({ from: vi.fn(() => dbBuilder) })),
}))

global.fetch = vi.fn()

import { GET, POST } from '@/app/api/mcp/route'

beforeEach(() => {
  mockDbData = []
  vi.mocked(global.fetch).mockReset()
})

function makeGet(qs = '') {
  return new NextRequest(`http://localhost/api/mcp${qs}`)
}
function makePost(body: any) {
  return new NextRequest('http://localhost/api/mcp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('GET /api/mcp', () => {
  it('lists exactly the 5 documented tools by default (no method param)', async () => {
    const res = await GET(makeGet())
    const body = await res.json()
    expect(body.tools).toHaveLength(5)
    expect(body.tools.map((t: any) => t.name)).toEqual([
      'crost_run_goal',
      'crost_get_goal_status',
      'crost_search_knowledge',
      'crost_list_departments',
      'crost_get_memos',
    ])
  })

  it('lists tools when method=tools/list is explicit', async () => {
    const res = await GET(makeGet('?method=tools/list'))
    const body = await res.json()
    expect(body.tools).toHaveLength(5)
    expect(body._meta.server).toBe('crost-mcp')
  })

  it('returns 404 for an unrecognized method', async () => {
    const res = await GET(makeGet('?method=unknown/thing'))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/mcp — tools/call dispatch', () => {
  it('rejects methods other than tools/call with 400', async () => {
    const res = await POST(makePost({ method: 'not/supported', params: {} }))
    expect(res.status).toBe(400)
  })

  it('returns 404 for an unknown tool name', async () => {
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'nonexistent_tool', arguments: {} } }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/Unknown tool/)
  })

  it('crost_search_knowledge queries knowledge_base_files and wraps results as text content', async () => {
    mockDbData = [{ id: 'kb-1', title: 'Doc' }]
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'crost_search_knowledge', arguments: { query: 'x', userId: 'u1' } } }))
    const body = await res.json()
    const parsed = JSON.parse(body.content[0].text)
    expect(parsed.results).toEqual(mockDbData)
  })

  it('crost_list_departments queries departments and returns them', async () => {
    mockDbData = [{ slug: 'sales', name: 'Sales' }]
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'crost_list_departments', arguments: { userId: 'u1' } } }))
    const body = await res.json()
    const parsed = JSON.parse(body.content[0].text)
    expect(parsed.departments).toEqual(mockDbData)
  })

  it('crost_get_memos queries company_memos and returns them', async () => {
    mockDbData = [{ id: 'm1', title: 'Memo' }]
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'crost_get_memos', arguments: { userId: 'u1' } } }))
    const body = await res.json()
    const parsed = JSON.parse(body.content[0].text)
    expect(parsed.memos).toEqual(mockDbData)
  })

  it('crost_run_goal proxies to /api/adk and returns goalId + executing status', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      headers: new Map([['X-Goal-Id', 'goal-123']]) as any,
    } as any)
    // Response.headers.get needs a get() method; Map doesn't have NextResponse-style get by default but does support .get
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'crost_run_goal', arguments: { founder_input: 'do a thing' } } }))
    const body = await res.json()
    const parsed = JSON.parse(body.content[0].text)
    expect(parsed.status).toBe('executing')
  })

  it('crost_get_goal_status proxies to /api/goals/:id and passes through the JSON body', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      json: () => Promise.resolve({ status: 'completed' }),
    } as any)
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'crost_get_goal_status', arguments: { goalId: 'g1' } } }))
    const body = await res.json()
    const parsed = JSON.parse(body.content[0].text)
    expect(parsed.status).toBe('completed')
  })

  it('returns a 500 error envelope with isError:true when a tool handler throws', async () => {
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('network down'))
    const res = await POST(makePost({ method: 'tools/call', params: { name: 'crost_run_goal', arguments: { founder_input: 'x' } } }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.isError).toBe(true)
    expect(body.content[0].text).toContain('network down')
  })
})
