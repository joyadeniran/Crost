import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { beginIdempotentRequest, completeIdempotentRequest } from '@/lib/idempotency'

export const dynamic = 'force-dynamic'

const ToolRequestSchema = z.object({
  tool: z.string(),
  params: z.record(z.any()).default({}),
  goal_id: z.string().optional(),
  task_id: z.string().optional(),
  department_slug: z.string().optional(),
  department_id: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const authClient = await createSupabaseServerComponentClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const supabase = createServerSupabaseClient()

    const body = await req.json()
    const { tool, params, ...context } = ToolRequestSchema.parse(body)

    const idempotency = await beginIdempotentRequest(req, supabase, user.id, body)
    if (idempotency.kind === 'response') return idempotency.response

    // 2. Identify Service from Tool Name
    // Mapping: apollo_search_contacts -> service: 'apollo', action: 'search_contacts'
    // This is a simplified mapper for now.
    let service: string | null = null
    let action = tool

    if (tool.startsWith('gmail_')) {
      service = 'gmail'
      action = tool.replace('gmail_', '')
    } else if (tool.startsWith('github_')) {
      service = 'github'
      action = tool.replace('github_', '')
    } else if (tool.startsWith('slack_')) {
      service = 'slack'
      action = tool.replace('slack_', '')
    } else if (tool.startsWith('apollo_')) {
      service = 'apollo'
      action = tool.replace('apollo_', '')
    }

    // 3. Handle Other Integrated Services (Placeholder for future upgrades)

    // 4. Fallback to Mock Registry (for other tools not yet upgraded to Nango)
    const MOCK_TOOLS: Record<string, (params: any, context: any) => Promise<any>> = {
      supabase_query: async (p) => {
        if (!p.query) throw new Error('Query parameter is required')
        const { data, error } = await supabase.rpc('read_only_query', { query_text: p.query })
        if (error) throw error
        return { status: 'success', query: p.query, rows: data }
      },
      company_memos: async (p, ctx) => {
        const query = supabase
          .from('company_memos')
          .select('title, body, from_department, priority, created_at')
          .order('created_at', { ascending: false })
          .limit(p.limit || 5)
        
        if (ctx.goal_id) {
          query.eq('goal_id', ctx.goal_id)
        } else {
          query.eq('created_by', user.id)
        }

        const { data, error } = await query
        if (error) throw error
        return { status: 'success', memos: data }
      },
      render_mcp: async (p, ctx) => {
        const apiKey = process.env.RENDER_API_KEY
        if (!apiKey) throw new Error('RENDER_API_KEY not configured')
        
        // Example: Trigger deploy for a service
        const res = await fetch(`https://api.render.com/v1/services/${p.serviceId}/deploys`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ clearCache: 'do_not_clear' })
        })
        
        if (!res.ok) throw new Error(`Render API failed: ${await res.text()}`)
        return { status: 'success', data: await res.json() }
      },
      get_sales_data: async (p) => ({ status: 'success', revenue: '$14,250.00' }),
      save_document: async (p, ctx) => {
        const { data } = await supabase.from('artifacts').insert({
          goal_id: ctx.goal_id || null,
          department_id: ctx.department_id || null,
          department_slug: ctx.department_slug || 'system',
          artifact_type: 'document',
          title: p.title || 'Untitled Document',
          body: p.content || '',
          // Sandbox: manual saves land in draft
          status: 'draft',
          version: 1,
          metadata: { task_id: ctx.task_id, tool: 'save_document' },
          sources: { memo_ids: [], kb_file_ids: [], tool_calls: [{ tool: 'save_document', executed_at: new Date().toISOString() }] },
        }).select().single()
        return { status: 'success', document_id: data?.id }
      },
      knowledge_base_import: async (p, ctx) => {
        if (!p.artifact_id) throw new Error('artifact_id is required')
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/knowledge/import`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': req.headers.get('cookie') || ''
          },
          body: JSON.stringify({ artifact_id: p.artifact_id })
        })
        if (!res.ok) throw new Error(`KB Import failed: ${await res.text()}`)
        return await res.json()
      }
    }

    const fn = MOCK_TOOLS[tool]
    if (!fn) {
      return NextResponse.json({ success: false, error: `Tool implementation not found: ${tool}` }, { status: 400 })
    }

    console.log(`[MCP V1 Fallback] Executing Mock Tool: ${tool}`)
    const result = await fn(params, context)

    const responseBody = {
      success: true,
      data: result
    }
    await completeIdempotentRequest(req, supabase, user.id, responseBody, 200)

    return NextResponse.json(responseBody)
  } catch (err: any) {
    console.error('[MCP Engine Error]', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Execution failed' },
      { status: 500 }
    )
  }
}
