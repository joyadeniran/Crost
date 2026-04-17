'use client'

import { usePathname } from 'next/navigation'
import { LiveEventsPanel } from './LiveEventsPanel'
import type { EventLogEntry } from '@/types'

interface Props {
  children: React.ReactNode
  initialEvents: EventLogEntry[]
}

export function ContentWrapper({ children, initialEvents }: Props) {
  const pathname = usePathname()
  
  // Define pages where the Live Events sidebar should be HIDDEN
  // These are focus-heavy or space-intensive pages.
  const hideSidebarOn = [
    '/dashboard/settings',
    '/dashboard/knowledge',
    '/dashboard/memos',
    '/dashboard/approvals',
    '/dashboard/artifacts'
  ]

  // Check if current path starts with any of the hidden paths
  const isHidden = hideSidebarOn.some(path => pathname.startsWith(path))

  return (
    <div className="crost-content">
      <div className="crost-page">
        {children}
      </div>
      {!isHidden && <LiveEventsPanel initial={initialEvents} />}
    </div>
  )
}
