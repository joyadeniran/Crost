import type { EventLogEntry } from '@/types'

interface Props {
  children: React.ReactNode
  /** @deprecated the live events side panel was removed (beta simplification); kept so callers compile. */
  initialEvents?: EventLogEntry[]
}

// Beta: one calm column. Chat is the home screen; Approvals / Artifacts / Settings are the only other places.
export function ContentWrapper({ children }: Props) {
  return (
    <div className="crost-content">
      <div className="crost-page">{children}</div>
    </div>
  )
}
