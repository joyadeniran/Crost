import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

interface Params { params: { slug: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const guardResult = await requireUser(_req)
    if (!guardResult.ok) return guardResult.response
    const user = { id: guardResult.userId }

    const { allowed, retryAfterSeconds } = checkRateLimit(user.id)
    if (!allowed) {
      return NextResponse.json({ error: 'Rate limit exceeded', retry_in: `${retryAfterSeconds} seconds` }, { status: 429 })
    }

    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('slug', params.slug)
      .eq('created_by', user.id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Department not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/departments/:slug]', err)
    return NextResponse.json({ error: 'Failed to fetch department' }, { status: 500 })
  }
}

const UpdateSchema = z.object({
  persona_prompt: z.string().min(50).optional(),
  tone_override: z.string().nullable().optional(),
  capabilities: z.array(z.string()).optional(),
  restrictions: z.array(z.string()).optional(),
  model_provider: z.enum(['local', 'gemini', 'claude', 'groq']).optional(),
  model_name: z.string().optional(),
  tools: z.array(z.string()).optional(),
  icon: z.string().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  reset_to_template: z.boolean().optional(),
})
