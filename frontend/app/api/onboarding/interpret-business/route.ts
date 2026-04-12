import { NextRequest, NextResponse } from 'next/server'
import { callLLM, CLOUD_MODEL } from '@/lib/llm-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { description } = await req.json()

    if (!description || description.trim().length === 0) {
      return NextResponse.json({ category: 'New Business', confidence: 'low' })
    }

    const prompt = `
A founder described their business as: "${description}"
Respond with a single short phrase (max 8 words) that categorises this business.
Examples: "B2B SaaS for logistics teams", "Consumer fintech for gig workers",
"B2B credit infrastructure for informal retail", "D2C fashion brand".
Return ONLY the phrase. No punctuation, no explanation.
`

    // Bootstrap call — always uses system key, exempt from daily limit
    const { content } = await callLLM(
      CLOUD_MODEL,
      prompt,
      "You are a business categorization expert. Be concise.",
      undefined,    // no userId during onboarding
      undefined,    // no providerOverride
      true          // isBootstrap = true
    )

    return NextResponse.json({ 
      category: content.trim().replace(/^"|"$/g, ''), 
      confidence: 'high' 
    })
  } catch (err: any) {
    console.error('[Interpret Business API Error]:', err)
    // Never block onboarding on failure
    return NextResponse.json({ 
      category: 'Business', 
      confidence: 'low',
      error: err.message 
    })
  }
}
