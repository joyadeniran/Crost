'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ModeToggle } from '@/components/ui/ModeToggle'
import { useCrostStore } from '@/lib/store'
import { NotificationDropdown } from './NotificationDropdown'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':               'Agent Office',
  '/dashboard/approvals':     'Approval Feed',
  '/dashboard/knowledge':     'Knowledge Base',
  '/dashboard/memos':         'Company Memos',
  '/dashboard/settings':      'Settings',
  '/dashboard/constitution':  'Constitution',
  '/dashboard/artifacts':     'Artifacts',
  '/dashboard/event-log':     'Event Log',
}

function BellIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  )
}

export function Topbar() {
  const pathname = usePathname()
  const pendingCount = useCrostStore(s => s.pendingApprovalCount)
  const [showNotifications, setShowNotifications] = useState(false)
  
  // Match dept pages — extract slug for richer title
  const isDeptPage = pathname.startsWith('/dashboard/departments/') && pathname !== '/dashboard/departments/new'
  const isDeptSettings = isDeptPage && pathname.endsWith('/settings')
  const title = isDeptSettings
    ? 'Department Settings'
    : isDeptPage
    ? 'Department'
    : PAGE_TITLES[pathname] ?? 'Crost'

  return (
    <div className="crost-topbar">
      {/* Title */}
      <span className="crost-topbar-title">
        {title}
      </span>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ModeToggle />

        {/* Bell with Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`topbar-control-btn ${showNotifications ? 'active' : ''}`}
          >
            <BellIcon />
            {pendingCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 17,
                height: 17,
                background: 'var(--red)',
                boxShadow: '0 0 8px rgba(239, 68, 68, 0.4)',
                borderRadius: '50%',
                fontSize: 9,
                fontWeight: 700,
                fontFamily: 'var(--font-dm-mono, monospace)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                border: '1.5px solid var(--bg-2)',
              }}>
                {pendingCount}
              </span>
            )}
          </button>
          
          {showNotifications && (
            <NotificationDropdown onClose={() => setShowNotifications(false)} />
          )}
        </div>

        {/* Settings */}
        <Link
          href="/dashboard/settings"
          className={`topbar-control-btn ${pathname === '/dashboard/settings' ? 'active' : ''}`}
        >
          <GearIcon />
        </Link>
      </div>
    </div>
  )
}
