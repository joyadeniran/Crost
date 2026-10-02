export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ChatView } from '@/components/chat/ChatView'

// Home is a conversation with Orc. Departments, approvals and deliverables hang off it.
export default async function HomePage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const { data } = await createServerSupabaseClient()
    .from('company_profile')
    .select('founder_name')
    .eq('created_by', user.id)
    .maybeSingle()
  const first = String((data as { founder_name?: string } | null)?.founder_name ?? '').trim().split(/\s+/)[0] || null

  return <ChatView chatId={null} greetingName={first} />
}
