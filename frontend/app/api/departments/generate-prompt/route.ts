// POST /api/departments/generate-prompt
// Auto-generates a department persona prompt + capabilities/restrictions from
// the department name/description and the founder's company context, so
// founders don't have to hand-write a persona when creating a custom
// department. The result prefills the creation wizard — the founder can edit
// everything before saving.
//
// Session-auth only (no internal mode): this is a founder-facing drafting
// helper, never called by the worker.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { callLLM, getModel } from '@/lib/llm-client'
import { requireUser } from '@/lib/auth/guard'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const GenerateSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  description: z.string().max(500).optional(),
})

// Written to produce personas that WEAK execution models can follow:
// concrete role, scope boundaries, explicit output discipline — no flowery
// biography text that small models imitate instead of obeying.
const GENERATOR_SYSTEM_NOTE = `You write operating instructions for AI department agents inside Crost, a founder's AI company OS. Department agents execute discrete tasks and must produce structured JSON deliverables.

Respond with valid JSON only — no prose, no markdown fences:
{
  "persona_prompt": "<the department agent's role prompt>",
  "capabilities": ["<3-6 short capability statements>"],
  "restrictions": ["<2-5 short restriction statements>"]
}

persona_prompt requirements (it will be executed by small/cheap LLMs, so be concrete and imperative):
- Start with "You are the <name> department lead for <company>."
- 4-8 sentences: what the department owns, its quality bar, and how it works.
- Include: "Ground every output in company memos, prior task outputs, and the knowledge base. Never invent facts, metrics, or names — use clearly marked placeholders when data is missing."
- Include one sentence on output discipline: structured, actionable deliverables with clear next steps.
- No buzzwords, no biography, no "passionate about".

capabilities: things this department DOES (task types it should confidently take on).
restrictions: things it must NOT do (beyond the global approval gate, which already covers external actions).`

export async function POST(req: NextRequest) {
  try {
    const guardResult = await requireUser(req)
    if (!guardResult.ok) return guardResult.response
    const userId = guardResult.userId

    const body = await req.json()
    const { name, description } = GenerateSchema.parse(body)

    // Company context — makes the persona specific instead of generic.
    const supabase = createServerSupabaseClient()
    const { data: memo } = await supabase
      .from('company_memo')
      .select('company_profile')
      .eq('user_id', userId)
      .maybeSingle()

    const profile = (memo?.company_profile ?? {}) as any
    const companyLine = profile.name
      ? `COMPANY: ${profile.name}${profile.industry ? ` (${profile.industry})` : ''}${profile.description ? ` — ${profile.description}` : ''}`
      : 'COMPANY: (no profile on record — write the persona generically but keep the structure)'

    const prompt = [
      `DEPARTMENT NAME: ${name}`,
      description ? `FOUNDER'S DESCRIPTION: ${description}` : '',
      companyLine,
      '',
      'Generate the persona JSON now.',
    ].filter(Boolean).join('\n')

    const { model } = await getModel('planning', userId)
    const { content } = await callLLM(model, prompt, GENERATOR_SYSTEM_NOTE, userId)

    // Salvage the outermost JSON object — small models add preamble/fences.
    let jsonStr = content.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    const first = jsonStr.indexOf('{')
    const last = jsonStr.lastIndexOf('}')
    if (first === -1 || last <= first) {
      return NextResponse.json(
        { error: 'Prompt generation produced no usable output. Please try again or write the persona manually.' },
        { status: 502 }
      )
    }

    let parsed: any
    try {
      parsed = JSON.parse(jsonStr.slice(first, last + 1))
    } catch {
      return NextResponse.json(
        { error: 'Prompt generation produced no usable output. Please try again or write the persona manually.' },
        { status: 502 }
      )
    }

    const personaPrompt = typeof parsed.persona_prompt === 'string' ? parsed.persona_prompt.trim() : ''
    if (personaPrompt.length < 50) {
      // CreateSchema requires >= 50 chars — never return a prefill that the
      // creation endpoint would immediately reject.
      return NextResponse.json(
        { error: 'Generated persona was too short. Please try again or write the persona manually.' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      data: {
        persona_prompt: personaPrompt,
        capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities.filter((c: any) => typeof c === 'string').slice(0, 6) : [],
        restrictions: Array.isArray(parsed.restrictions) ? parsed.restrictions.filter((r: any) => typeof r === 'string').slice(0, 5) : [],
      },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('[POST /api/departments/generate-prompt]', err)
    return NextResponse.json({ error: 'Failed to generate department prompt' }, { status: 500 })
  }
}
