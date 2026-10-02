'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// Phones: a slim top bar with a menu button that slides the full sidebar in as a drawer.
export function MobileTopBar({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname()

  // Close the drawer whenever the route changes (a link inside it was tapped).
  useEffect(() => { document.body.classList.remove('nav-open') }, [pathname])

  return (
    <>
      <header className="mobile-bar">
        <button
          className="menu-btn"
          aria-label="Open menu"
          onClick={() => document.body.classList.toggle('nav-open')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          {pendingCount > 0 && <span className="menu-dot" aria-label={`${pendingCount} approvals waiting`} />}
        </button>
        <Link href="/app" className="side-brand">Crost</Link>
        <a href="/app" className="menu-btn" aria-label="New chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </a>
      </header>
      <div className="nav-backdrop" onClick={() => document.body.classList.remove('nav-open')} />
    </>
  )
}
