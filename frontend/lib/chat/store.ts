// lib/chat/store.ts — chat persistence (owner-scoped, explicit columns, bounded reads).
// Server-side ONLY.
import { createServerSupabaseClient } from '@/lib/supabase'
import type { ChatTurn, CompanyContext } from './orc'

export const HISTORY_TURNS = 20
export const MAX_MESSAGES_RETURNED = 200

export async function getOwnedChat(chatId: string, userId: string) {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('chats')
    .select('id, title, created_at, updated_at')
    .eq('id', chatId)
    .eq('created_by', userId)
    .maybeSingle()
  return data as { id: string; title: string; created_at: string; updated_at: string } | null
}

export async function createChat(userId: string, firstMessage: string) {
  const supabase = createServerSupabaseClient()
  const title = firstMessage.replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat'
  const { data, error } = await supabase
    .from('chats')
    .insert({ created_by: userId, title })
    .select('id, title')
    .single()
  if (error || !data) throw new Error(`Could not create chat: ${error?.message ?? 'unknown'}`)
  return data as { id: string; title: string }
}

export async function loadHistory(chatId: string, userId: string): Promise<ChatTurn[]> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('chat_id', chatId)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_TURNS)
  return ((data ?? []) as Array<{ role: 'user' | 'assistant'; content: string }>)
    .reverse()
    .filter((m) => m.content)
    .map((m) => ({ role: m.role, content: m.content }))
}

export async function addMessage(row: {
  chatId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  meta?: Record<string, unknown>
}) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ chat_id: row.chatId, created_by: row.userId, role: row.role, content: row.content, meta: row.meta ?? {} })
    .select('id, created_at')
    .single()
  if (error || !data) throw new Error(`Could not save message: ${error?.message ?? 'unknown'}`)
  await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', row.chatId).eq('created_by', row.userId)
  return data as { id: string; created_at: string }
}

export async function loadCompanyContext(userId: string): Promise<CompanyContext> {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('company_profile')
    .select('company_name, founder_name, business_description, industry, stage, target_customer, city, country')
    .eq('created_by', userId)
    .maybeSingle()
  const p = (data ?? {}) as Record<string, string | null>
  return {
    companyName: p.company_name,
    founderName: p.founder_name,
    description: p.business_description,
    industry: p.industry,
    stage: p.stage,
    targetCustomer: p.target_customer,
    location: [p.city, p.country].filter(Boolean).join(', ') || null,
  }
}
