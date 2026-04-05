'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActivationStage } from '@/types'

interface Props {
  slug: string
  stage: ActivationStage
}

export function ActivateButton({ slug, stage }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = stage === 'draft' ? 'Send to Review' : 'Activate'

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/departments/${slug}/activate`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed.'); return }
      router.refresh()
    } catch {
      setError('Network error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn-primary-crost"
      >
        {loading ? 'Working…' : label}
      </button>
      {error && (
        <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--red)' }}>
          {error}
        </p>
      )}
    </div>
  )
}
