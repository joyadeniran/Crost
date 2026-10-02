// POST /api/chat — send a message to Orc and stream the reply.
// Body: { chat_id?: uuid, message: string }. Creates the chat when chat_id is absent.
// Response: text/plain stream of the reply, then a NUL byte and a JSON trailer
//   { chat_id, message_id, plan, facts } or { error }. `facts` are facts Orc proposes to remember;
//   nothing is saved until the founder confirms them (POST /api/facts).
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/guard'
import { checkRateLimit } from '@/lib/rate-limit'
import { checkTokenBudget } from '@/lib/engine/budget'
import { logUsage } from '@/lib/usage-logger'
import { buildOrcSystemPrompt, extractBlocks, streamOrcReply, TRAILER } from '@/lib/chat/orc'
import { listFacts } from '@/lib/facts/store'
import { formatFactsForPrompt } from '@/lib/facts/facts'
import { addMessage, createChat, getOwnedChat, loadCompanyContext, loadHistory } from '@/lib/chat/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Body = z.object({
  chat_id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(8000),
})

export async function POST(req: NextRequest) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  const userId = guard.userId

  const rl = checkRateLimit(`chat:${userId}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: 'You are sending messages very fast — try again in a moment.', code: 'RATE_LIMITED' }, { status: 429 })
  }

  let body: z.infer<typeof Body>
  try {
    body = Body.parse(await req.json())
  } catch {
    return NextResponse.json({ success: false, error: 'A message is required.', code: 'VALIDATION_ERROR' }, { status: 400 })
  }

  // Everything Orc needs before it can start typing, fetched in parallel (latency matters here).
  const [budget, owned, history, ctx, facts] = await Promise.all([
    checkTokenBudget(userId),
    body.chat_id ? getOwnedChat(body.chat_id, userId) : Promise.resolve(null),
    body.chat_id ? loadHistory(body.chat_id, userId) : Promise.resolve([]),
    loadCompanyContext(userId),
    // Facts sharpen the answer but must never block it.
    listFacts(userId).catch((err) => { console.error('[POST /api/chat] facts unavailable:', err); return [] }),
  ])
  if (!budget.allowed) {
    return NextResponse.json({ success: false, error: 'Daily free usage reached. It resets tomorrow.', code: 'TOKEN_BUDGET' }, { status: 429 })
  }
  if (body.chat_id && !owned) {
    return NextResponse.json({ success: false, error: 'Chat not found', code: 'NOT_FOUND' }, { status: 404 })
  }
  const chatId = body.chat_id ?? (await createChat(userId, body.message)).id
  await addMessage({ chatId, userId, role: 'user', content: body.message })
  const turns = [...history, { role: 'user' as const, content: body.message }]
  const system = buildOrcSystemPrompt({ ...ctx, factsBlock: formatFactsForPrompt(facts) })
  const finalChatId = chatId
  const enc = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = ''
      try {
        const gen = streamOrcReply({ system, history: turns })
        let step = await gen.next()
        while (!step.done) {
          full += step.value
          controller.enqueue(enc.encode(step.value))
          step = await gen.next()
        }
        const { model, tokens } = step.value
        const { reply, plan, facts: proposed } = extractBlocks(full)
        const meta: Record<string, unknown> = {}
        if (plan) meta.plan = plan
        if (proposed.length) meta.facts = proposed
        const saved = await addMessage({
          chatId: finalChatId,
          userId,
          role: 'assistant',
          content: reply || (plan ? `Here's how I'd run "${plan.title}".` : proposed.length ? 'Want me to remember this?' : ''),
          meta,
        })
        logUsage({
          userId, model: `gemini/${model}`, provider: 'gemini', keyType: 'system',
          promptTokens: 0, completionTokens: tokens, totalTokens: tokens,
        }).catch(() => {})
        controller.enqueue(enc.encode(TRAILER + JSON.stringify({ chat_id: finalChatId, message_id: saved.id, plan, facts: proposed })))
      } catch (err) {
        console.error('[POST /api/chat] reply failed:', err)
        controller.enqueue(enc.encode(TRAILER + JSON.stringify({
          chat_id: finalChatId,
          error: "I couldn't reach the model just now. Please try again.",
        })))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Chat-Id': finalChatId,
    },
  })
}
