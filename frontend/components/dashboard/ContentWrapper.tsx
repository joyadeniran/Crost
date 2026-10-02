'use client'

import { usePathname } from 'next/navigation'
import type { EventLogEntry } from '@/types'

interface Props {
  children: React.ReactNode
  /** @deprecated the live events side panel was removed (beta simplification); kept so callers compile. */
  initialEvents?: EventLogEntry[]
}

// Chat pages fill the column themselves; every other page sits in a calm reading column.
export function ContentWrapper({ children }: Props) {
  const pathname = usePathname()
  const isChat = pathname === '/app' || pathname.startsWith('/app/c/')
  return (
    <div className="crost-content">
      <div className={isChat ? 'crost-page' : 'crost-page page-col'}>{children}</div>
    </div>
  )
}
