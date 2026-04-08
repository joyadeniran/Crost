import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabaseClient } from '@/lib/supabase'

const ToolRequestSchema = z.object({
  tool: z.string(),
  params: z.record(z.any()).default({}),
  goal_id: z.string().optional(),
  task_id: z.string().optional(),
  department_slug: z.string().optional(),
  department_id: z.string().optional(),
})

// MCP Tools Registry
const TOOLS: Record<string, (params: any, context: any) => Promise<any>> = {
  get_sales_data: async (params) => {
    return {
      status: 'success',
      report_date: new Date().toISOString(),
      range: params.range || '30d',
      revenue: '$14,250.00',
      active_subscriptions: 142,
      churn_rate: '2.1%',
      top_tier_customers: 14
    }
  },
  
  get_customer_list: async (params) => {
    return {
      status: 'success',
      segment: params.segment || 'all',
      customers: [
        { id: 'C001', name: 'Acme Corp', ltv: '$4,200', health: 'Good' },
        { id: 'C002', name: 'Globex', ltv: '$1,900', health: 'At Risk' },
        { id: 'C003', name: 'Stark Ind', ltv: '$9,500', health: 'Excellent' }
      ]
    }
  },
  
  send_whatsapp_message: async (params) => {
    console.log(`[MCP Tool Executed] Simulated WhatsApp sent to ${params.to}: "${params.message}"`)
    return {
      status: 'success',
      delivered: true,
      timestamp: new Date().toISOString(),
      simulated: true,
      sent_to: params.to
    }
  },
  
  save_document: async (params, context) => {
    const supabase = createServerSupabaseClient()
    
    const { data, error } = await supabase.from('artifacts').insert({
      goal_id: context.goal_id || null,
      department_id: context.department_id || null,
      department_slug: context.department_slug || 'system',
      artifact_type: 'document',
      title: params.title || 'Untitled Document',
      body: params.content || '',
      metadata: {
        task_id: context.task_id,
        tool: 'save_document',
        saved_at: new Date().toISOString()
      }
    }).select().single()

    if (error) {
      console.error('[save_document tool error]', error)
      return { status: 'error', message: error.message }
    }

    return {
      status: 'success',
      document_id: data.id,
      document_title: data.title,
      saved_at: data.created_at,
      bytes: String(params.content || '').length
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { tool, params, ...context } = ToolRequestSchema.parse(body)

    const fn = TOOLS[tool]
    if (!fn) {
      return NextResponse.json({ success: false, error: `Tool implementation not found: ${tool}` }, { status: 400 })
    }

    console.log(`[MCP Engine] Executing Tool: ${tool} for Task: ${context.task_id}`)
    const result = await fn(params, context)

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (err: any) {
    console.error('[MCP Engine Error]', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Execution failed' },
      { status: 500 }
    )
  }
}
