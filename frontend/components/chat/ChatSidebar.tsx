'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { useCrostStore } from '@/lib/store'
import { useOnboardingStore } from '@/lib/onboarding-store'

type ChatRow = { id: string; title: string; updated_at: string }

export function ChatSidebar({ pendingCount: initialPending, identity }: { pendingCount: number; identity: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const livePending = useCrostStore((s) => s.pendingApprovalCount)
  const pending = livePending ?? initialPending
  const [chats, setChats] = useState<ChatRow[]>([])

  const load = useCallback(() => {
    fetch('/api/chats')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.success) setChats(j.data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('crost:chats-changed', load)
    return () => window.removeEventListener('crost:chats-changed', load)
  }, [load])

  const activeChat = pathname.startsWith('/app/c/') ? pathname.split('/')[3] : null

  const remove = async (id: string) => {
    if (!confirm('Delete this chat?')) return
    await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    setChats((c) => c.filter((x) => x.id !== id))
    if (activeChat === id) router.push('/app')
  }

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      useOnboardingStore.getState().reset()
      localStorage.removeItem('crost-onboarding-storage')
    } finally {
      router.push('/login')
      router.refresh()
    }
  }

  const nav = (href: string, label: string, badge?: number) => (
    <Link href={href} className={`side-link${pathname.startsWith(href) ? ' active' : ''}`}>
      <span>{label}</span>
      {badge ? <span className="side-badge">{badge}</span> : null}
    </Link>
  )

  return (
    <>
      <div className="side-top">
        <Link href="/app" className="side-brand">Crost</Link>
        <Link href="/app" className="pill-btn new-chat" onClick={() => { if (pathname === '/app') window.location.href = '/app' }}>
          + New chat
        </Link>
      </div>

      <div className="side-section">
        <div className="eyebrow side-label">Recent</div>
        <div className="side-chats">
          {chats.length === 0 && <div className="side-empty">Your chats with Orc appear here.</div>}
          {chats.map((c) => (
            <div key={c.id} className={`side-chat${activeChat === c.id ? ' active' : ''}`}>
              <Link href={`/app/c/${c.id}`} title={c.title}>{c.title}</Link>
              <button aria-label="Delete chat" onClick={() => remove(c.id)}>×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="side-bottom">
        {nav('/app/notifications', 'Approvals', pending)}
        {nav('/app/artifacts', 'Deliverables')}
        {nav('/app/settings', 'Settings')}
        <div className="side-identity">
          <span title={identity}>{identity}</span>
          <button className="link-btn" onClick={logout}>Sign out</button>
        </div>
      </div>
    </>
  )
}
