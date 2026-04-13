'use client'

import { useState } from 'react'
import { Artifact } from '@/types'
import Image from 'next/image'

interface Props {
  artifact: Artifact
}

/** Strip markdown code-fence wrappers (```json ... ```) stored by the worker */
function cleanArtifactBody(raw: string): string {
  // Remove leading/trailing code fences with optional language tag
  const stripped = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  // Try to parse as JSON and pretty-print for readability
  try {
    const parsed = JSON.parse(stripped)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return stripped
  }
}

export function ArtifactCard({ artifact }: Props) {
  const createdAt = new Date(artifact.created_at)
  const cleanBody = artifact.body ? cleanArtifactBody(artifact.body) : null

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

  const [showPreview, setShowPreview] = useState(false)

  const downloadArtifact = (e: React.MouseEvent) => {
    e.stopPropagation()
    const content = cleanBody || JSON.stringify(artifact.metadata, null, 2)
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = artifact.preview_url || url
    link.download = `${artifact.title.replace(/\s+/g, '_')}_${artifact.artifact_type}.${artifact.artifact_type === 'image' ? 'png' : 'txt'}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <>
      <div className="memo-item normal" style={{ cursor: 'pointer', transition: 'all 0.2s ease', position: 'relative' }} 
           onClick={() => setShowPreview(true)}>
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

        {cleanBody && (
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
            {cleanBody}
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
            border: '1px solid var(--border)',
            position: 'relative'
          }}>
            <Image 
              src={artifact.preview_url} 
              alt={artifact.title} 
              fill
              unoptimized
              style={{ objectFit: 'cover' }} 
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          
          <button 
            onClick={downloadArtifact}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 9,
              background: 'var(--accent-dim)',
              color: 'var(--accent)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}>
            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v4M7 10l5 5 5-5M12 15V3" />
            </svg>
            SAVE
          </button>
        </div>
      </div>

      {showPreview && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '40px'
        }} onClick={() => setShowPreview(false)}>
          <div style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            maxWidth: '1000px',
            width: '100%',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ 
              padding: '16px 24px', 
              borderBottom: '1px solid var(--border)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ color: 'var(--text-3)' }}><IconType /></div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-syne, Syne)', fontSize: 18 }}>{artifact.title}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={downloadArtifact} className="btn-primary-crost" style={{ padding: '6px 16px', fontSize: 12 }}>
                  DOWNLOAD
                </button>
                <button onClick={() => setShowPreview(false)} style={{ 
                  background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 24, cursor: 'pointer' 
                }}>
                  ×
                </button>
              </div>
            </div>
            
            <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
              {artifact.artifact_type === 'image' && artifact.preview_url ? (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                  <Image 
                    src={artifact.preview_url} 
                    fill
                    unoptimized
                    style={{ borderRadius: 8, border: '1px solid var(--border)', objectFit: 'contain' }} 
                    alt={artifact.title} 
                  />
                </div>
              ) : (
                <div style={{ 
                  fontFamily: 'var(--font-dm-sans, sans-serif)', 
                  whiteSpace: 'pre-wrap', 
                  fontSize: 14, 
                  lineHeight: 1.8, 
                  color: 'var(--text-2)' 
                }}>
                  {cleanBody || "No text content available for this artifact."}
                  
                  {artifact.metadata && (
                    <div style={{ marginTop: 32, paddingTop: 32, borderTop: '1px solid var(--border)' }}>
                      <label style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-4)', display: 'block', marginBottom: 12 }}>
                        METADATA
                      </label>
                      <pre style={{ 
                        background: 'var(--bg-2)', 
                        padding: '16px', 
                        borderRadius: 8, 
                        fontSize: 11, 
                        color: 'var(--accent)',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(artifact.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
