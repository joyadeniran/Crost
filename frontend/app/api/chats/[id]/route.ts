// GET /api/chats/[id] — one chat with its messages. DELETE removes it (messages cascade).
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getOwnedChat, MAX_MESSAGES_RETURNED } from '@/lib/chat/store'

export const dynamic = 'force-dynamic'

type Params = { params: { id: string } }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = () => NextResponse.json({ success: false, error: 'Chat not found', code: 'NOT_FOUND' }, { status: 404 })

export async function GET(req: NextRequest, { params }: Params) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  if (!UUID_RE.test(params.id)) return notFound()
  const chat = await getOwnedChat(params.id, guard.userId)
  if (!chat) return notFound()
  const { data } = await createServerSupabaseClient()
    .from('chat_messages')
    .select('id, role, content, meta, created_at')
    .eq('chat_id', params.id)
    .eq('created_by', guard.userId)
    .order('created_at', { ascending: true })
    .limit(MAX_MESSAGES_RETURNED)
  return NextResponse.json({ success: true, data: { chat, messages: data ?? [] } })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  if (!UUID_RE.test(params.id)) return notFound()
  if (!(await getOwnedChat(params.id, guard.userId))) return notFound()
  await createServerSupabaseClient().from('chats').delete().eq('id', params.id).eq('created_by', guard.userId)
  return NextResponse.json({ success: true, data: { deleted: true } })
}
