export const dynamic = 'force-dynamic'

import { ChatView } from '@/components/chat/ChatView'

export default function ChatPage({ params }: { params: { id: string } }) {
  return <ChatView key={params.id} chatId={params.id} />
}
