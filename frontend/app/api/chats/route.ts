// GET /api/chats — the founder's recent chats (sidebar).
import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/guard'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guard = await requireUser(req)
  if (!guard.ok) return guard.response
  const { data, error } = await createServerSupabaseClient()
    .from('chats')
    .select('id, title, updated_at')
    .eq('created_by', guard.userId)
    .order('updated_at', { ascending: false })
    .limit(40)
  if (error) return NextResponse.json({ success: false, error: 'Failed to load chats' }, { status: 500 })
  return NextResponse.json({ success: true, data: data ?? [] })
}
