// GET/POST /api/mcp — Model Context Protocol server endpoint.
// Exposes Crost's capabilities as MCP tools so external agents
// (Claude, Gemini, custom ADK agents) can use them.

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// MCP tool definitions (follows MCP spec v2024-11-05)
const MCP_TOOLS = [
  {
    name: 'crost_run_goal',
    description: 'Submit a business goal to Crost for autonomous multi-agent execution. Crost will plan, coordinate departments, and execute the goal.',
    inputSchema: {
      type: 'object',
      properties: {
        founder_input: { type: 'string', description: 'The business goal or task for Crost to execute' },
        userId: { type: 'string', description: 'The user/founder ID' },
      },
      required: ['founder_input', 'userId'],
    },
  },
  {
    name: 'crost_get_goal_status',
    description: 'Get the current status and results of a running or completed goal.',
    inputSchema: {
      type: 'object',
      properties: {
        goalId: { type: 'string', description: 'The goal ID returned by crost_run_goal' },
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['goalId', 'userId'],
    },
  },
  {
    name: 'crost_search_knowledge',
    description: 'Search the company knowledge base for relevant documents, strategies, and context.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        userId: { type: 'string', description: 'The user ID' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query', 'userId'],
    },
  },
  {
    name: 'crost_list_departments',
    description: 'List all active AI departments available in Crost.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  {
    name: 'crost_get_memos',
    description: 'Get recent company memos documenting decisions, completed work, and company state.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        limit: { type: 'number', description: 'Number of memos to return' },
      },
      required: ['userId'],
    },
  },
]

// MCP ListTools response
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const method = searchParams.get('method')

  if (method === 'tools/list' || !method) {
    return NextResponse.json({
      tools: MCP_TOOLS,
      _meta: {
        server: 'crost-mcp',
        version: '1.0.0',
        platform: 'Google Cloud',
        framework: 'Google ADK',
      },
    })
  }

  return NextResponse.json({ error: 'Method not found' }, { status: 404 })
}

// MCP CallTool request handler
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { method, params } = body

  if (method !== 'tools/call') {
    return NextResponse.json({ error: 'Only tools/call supported' }, { status: 400 })
  }

  const { name, arguments: args } = params ?? {}
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.crosthq.com'

  try {
    switch (name) {
      case 'crost_run_goal': {
        const r = await fetch(`${baseUrl}/api/adk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-mcp-call': '1' },
          body: JSON.stringify({ founder_input: args.founder_input }),
        })
        const goalId = r.headers.get('X-Goal-Id')
        return NextResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ goalId, status: 'executing' }) }],
        })
      }

      case 'crost_get_goal_status': {
        const r = await fetch(`${baseUrl}/api/goals/${args.goalId}`, {
          headers: { 'x-mcp-call': '1' },
        })
        const data = await r.json()
        return NextResponse.json({
          content: [{ type: 'text', text: JSON.stringify(data) }],
        })
      }

      case 'crost_search_knowledge': {
        const { createDbClient } = await import('@/lib/db')
        const db = createDbClient()
        const { data } = await db
          .from('knowledge_base_files')
          .select('id, title, extracted_summary, category')
          .eq('created_by', args.userId)
          .ilike('title', `%${args.query}%`)
          .limit(args.limit ?? 5)

        return NextResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ results: data ?? [] }) }],
        })
      }

      case 'crost_list_departments': {
        const { createDbClient } = await import('@/lib/db')
        const db = createDbClient()
        const { data } = await db
          .from('departments')
          .select('slug, name, capabilities, activation_stage')
          .eq('activation_stage', 'active')
          .or(`created_by.eq.${args.userId},created_by.is.null`)

        return NextResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ departments: data ?? [] }) }],
        })
      }

      case 'crost_get_memos': {
        const { createDbClient } = await import('@/lib/db')
        const db = createDbClient()
        const { data } = await db
          .from('company_memos')
          .select('id, title, body, priority, from_department, created_at')
          .eq('created_by', args.userId)
          .order('created_at', { ascending: false })
          .limit(args.limit ?? 10)

        return NextResponse.json({
          content: [{ type: 'text', text: JSON.stringify({ memos: data ?? [] }) }],
        })
      }

      default:
        return NextResponse.json({ error: `Unknown tool: ${name}` }, { status: 404 })
    }
  } catch (err: any) {
    return NextResponse.json(
      { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true },
      { status: 500 }
    )
  }
}
