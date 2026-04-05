interface Props {
  personaId: string | null
  slug?: string
}

function getState(id: string | null, slug?: string): 'ok' | 'direct_llm' | 'failed' {
  if (!id || id === 'SYNC_FAILED' || id === 'DIRECT_LLM') return 'failed'
  if (id.startsWith('direct_llm:')) {
    // Only valid if it matches this department's slug
    return (!slug || id === `direct_llm:${slug}`) ? 'direct_llm' : 'failed'
  }
  return 'ok' // real Onyx persona ID
}

export function SyncFailedBadge({ personaId, slug }: Props) {
  const state = getState(personaId, slug)

  if (state === 'ok') return null

  if (state === 'direct_llm') {
    return (
      <span
        title="Running in Direct LLM mode — tasks work normally, Onyx RAG unavailable."
        style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 9,
          padding: '2px 7px',
          borderRadius: 4,
          background: 'rgba(77,166,255,0.12)',
          color: 'var(--blue)',
          border: '1px solid rgba(77,166,255,0.25)',
          letterSpacing: '0.04em',
          cursor: 'help',
        }}
      >
        DIRECT LLM
      </span>
    )
  }

  return (
    <span
      title="Department not synced. Click 'Sync Departments' on the dashboard to fix this."
      style={{
        fontFamily: 'var(--font-dm-mono, monospace)',
        fontSize: 9,
        padding: '2px 7px',
        borderRadius: 4,
        background: 'rgba(255,77,109,0.12)',
        color: 'var(--red)',
        border: '1px solid rgba(255,77,109,0.25)',
        letterSpacing: '0.04em',
        cursor: 'help',
      }}
    >
      ⚠ SYNC FAILED
    </span>
  )
}
