'use client'

import { Artifact } from '@/types'

interface Props {
  artifact: Artifact
}

export function ArtifactCard({ artifact }: Props) {
  const createdAt = new Date(artifact.created_at)

  const IconType = () => {
    switch (artifact.artifact_type) {
      case 'image':
        return (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      case 'spreadsheet':
      case 'data':
        return (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        )
      case 'code':
        return (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        )
      default:
        return (
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )
    }
  }

  return (
    <div className="memo-item normal" style={{ cursor: 'pointer', transition: 'all 0.2s ease' }} 
         onClick={() => window.open(artifact.preview_url || '#', '_blank')}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ color: 'var(--text-3)' }}>
            <IconType />
          </div>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            {artifact.title}
          </div>
        </div>
        <span style={{
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 10,
          color: 'var(--text-3)',
          flexShrink: 0,
        }}>
          {createdAt.toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {artifact.body && (
        <div style={{ 
          fontSize: 12, 
          color: 'var(--text-2)', 
          lineHeight: 1.6, 
          marginBottom: 12,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden'
        }}>
          {artifact.body}
        </div>
      )}

      {artifact.preview_url && artifact.artifact_type === 'image' && (
        <div style={{ 
          width: '100%', 
          aspectRatio: '16/9', 
          background: 'var(--bg-3)', 
          borderRadius: 4, 
          overflow: 'hidden', 
          marginBottom: 12,
          border: '1px solid var(--border)' 
        }}>
          <img src={artifact.preview_url} alt={artifact.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ 
          padding: '2px 8px', 
          borderRadius: 4, 
          fontFamily: 'var(--font-dm-mono, monospace)', 
          fontSize: 9, 
          background: 'var(--bg-4)', 
          color: 'var(--text-2)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {artifact.artifact_type}
        </span>
        <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-4)' }}>
          via {artifact.department_slug}
        </span>
      </div>
    </div>
  )
}
