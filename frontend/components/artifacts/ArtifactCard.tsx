'use client'

import { useState } from 'react'
import { Artifact } from '@/types'
import Image from 'next/image'

interface Props {
  artifact: Artifact
}

/** Extract a semantic text preview instead of dumping raw JSON */
function extractPreviewText(raw: string | null, type: string, file_url?: string | null): string {
  if (!raw) {
    if (file_url) return ` Native ${type} file attached. Click Download to retrieve the final asset.`;
    return 'No preview available.';
  }
  
  const stripped = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  
  try {
    const parsed = JSON.parse(stripped)
    if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.deliverable_content && typeof parsed.deliverable_content === 'string') return parsed.deliverable_content;
      if (parsed.content && typeof parsed.content === 'string') return parsed.content;
      if (parsed.summary) return parsed.summary;
      if (parsed.body) return parsed.body;
      
      // Look for the first meaningful string
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.length > 40) return value;
      }
      return `Structured ${type} payload containing ${Object.keys(parsed).length} keys. Download to view.`;
    }
  } catch {
    // If it's not JSON, return the raw stripped text
    return stripped;
  }
  return stripped;
}

export function ArtifactCard({ artifact }: Props) {
  const createdAt = new Date(artifact.created_at)
  const previewText = extractPreviewText(artifact.body, artifact.artifact_type, artifact.file_url)

  const IconType = () => {
    switch (artifact.artifact_type) {
      case 'image':
        return (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        )
      case 'spreadsheet':
      case 'data':
        return (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        )
      case 'code':
        return (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        )
      default:
        return (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        )
    }
  }

  const [showPreview, setShowPreview] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const downloadArtifact = (e: React.MouseEvent) => {
    e.stopPropagation()
    const link = document.createElement('a')
    
    if (artifact.file_url) {
      link.href = artifact.file_url
      link.target = "_blank"
      link.download = artifact.file_url.split('/').pop() || `${artifact.title.replace(/\s+/g, '_')}`
    } else if (artifact.preview_url) {
      link.href = artifact.preview_url
      link.download = `${artifact.title.replace(/\s+/g, '_')}_${artifact.artifact_type}.${artifact.artifact_type === 'image' ? 'png' : 'txt'}`
    } else {
      const content = artifact.body || JSON.stringify(artifact.metadata, null, 2)
      const blob = new Blob([content], { type: 'text/plain' })
      link.href = URL.createObjectURL(blob)
      link.download = `${artifact.title.replace(/\s+/g, '_')}_${artifact.artifact_type}.txt`
    }
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const deleteArtifact = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this artifact? This action cannot be undone.')) return
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/artifacts/${artifact.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete artifact')
      window.location.reload()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Failed to delete artifact. Please try again.')
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div 
        style={{ 
          cursor: 'pointer', 
          position: 'relative',
          padding: '24px',
          borderRadius: '16px',
          background: isHovered 
            ? 'linear-gradient(145deg, rgba(30, 30, 35, 0.95), rgba(20, 20, 24, 0.95))' 
            : 'rgba(20, 20, 24, 0.6)',
          border: isHovered 
            ? '1px solid rgba(255, 255, 255, 0.15)' 
            : '1px solid rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(12px)',
          boxShadow: isHovered 
            ? '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' 
            : '0 4px 15px rgba(0,0,0,0.2)',
          transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }} 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setShowPreview(true)}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ 
              color: 'var(--accent)', 
              background: 'rgba(0, 255, 170, 0.1)',
              padding: '10px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 0 0 1px rgba(0,255,170,0.2)'
            }}>
              <IconType />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ 
                fontWeight: 700, 
                fontSize: 16, 
                color: 'var(--text)', 
                letterSpacing: '-0.02em',
                fontFamily: 'var(--font-syne, Syne)'
              }}>
                {artifact.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ 
                  color: 'var(--text-3)', 
                  fontSize: '12px', 
                  fontFamily: 'Inter, sans-serif' 
                }}>
                  {createdAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                <span style={{ color: 'var(--text-4)' }}>•</span>
                <span style={{ 
                  color: 'var(--accent)', 
                  fontSize: '11px', 
                  fontFamily: 'var(--font-dm-mono, monospace)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  {artifact.department_slug}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          fontSize: 14,
          color: 'var(--text-2)',
          lineHeight: 1.6,
          fontFamily: 'Inter, sans-serif',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          padding: '0 4px'
        }}>
          {previewText}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
             <span style={{ 
              padding: '4px 10px', 
              borderRadius: '6px', 
              fontFamily: 'var(--font-dm-mono, monospace)', 
              fontSize: 10, 
              background: 'rgba(255,255,255,0.05)', 
              color: 'var(--text-2)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {artifact.artifact_type}
            </span>
            {(artifact.file_url || artifact.preview_url) && (
              <span style={{ 
                padding: '4px 10px', 
                borderRadius: '6px', 
                fontFamily: 'var(--font-dm-mono, monospace)', 
                fontSize: 10, 
                background: 'rgba(0,255,170,0.05)', 
                color: 'var(--accent)',
                textTransform: 'uppercase',
                border: '1px solid rgba(0,255,170,0.1)'
              }}>
                ATTACHMENT
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={downloadArtifact}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontWeight: 600,
                fontSize: 12,
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 10px rgba(0,255,170,0.2)'
              }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download
            </button>
            <button
              onClick={deleteArtifact}
              disabled={isDeleting}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                fontFamily: 'var(--font-dm-sans, sans-serif)',
                fontWeight: 600,
                fontSize: 12,
                background: 'rgba(255, 60, 60, 0.1)',
                color: 'rgb(255, 90, 90)',
                border: '1px solid rgba(255, 60, 60, 0.2)',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: isDeleting ? 0.6 : 1,
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 60, 60, 0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 60, 60, 0.1)'; }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {showPreview && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(10,10,12,0.85)',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '40px',
          animation: 'fadeIn 0.2s ease-out'
        }} onClick={() => setShowPreview(false)}>
          <div style={{
            background: 'linear-gradient(180deg, rgba(30,30,35,1), rgba(20,20,24,1))',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '20px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ 
              padding: '24px 32px', 
              borderBottom: '1px solid rgba(255,255,255,0.05)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.02)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ color: 'var(--accent)', background: 'rgba(0,255,170,0.1)', padding: '8px', borderRadius: '8px' }}>
                   <IconType />
                </div>
                <div>
                   <h3 style={{ margin: 0, fontFamily: 'var(--font-syne, Syne)', fontSize: 22, color: '#fff' }}>{artifact.title}</h3>
                   <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                      Generated by {artifact.department_slug} on {createdAt.toLocaleDateString()}
                   </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button 
                  onClick={downloadArtifact} 
                  style={{ 
                    padding: '8px 20px', 
                    fontSize: 13, 
                    background: 'var(--accent)', 
                    color: '#000', 
                    border: 'none', 
                    borderRadius: '8px', 
                    cursor: 'pointer',
                    fontWeight: 600,
                    boxShadow: '0 4px 14px rgba(0,255,170,0.25)' 
                  }}
                >
                  Download File
                </button>
                <button onClick={() => setShowPreview(false)} style={{
                  background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--text-3)', fontSize: 24, cursor: 'pointer',
                  width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  ×
                </button>
              </div>
            </div>
            
            <div style={{ padding: '32px', overflowY: 'auto', flex: 1, color: 'var(--text-2)' }}>
              {artifact.artifact_type === 'image' && artifact.preview_url ? (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                  <Image src={artifact.preview_url} fill unoptimized style={{ borderRadius: 12, border: '1px solid var(--border)', objectFit: 'contain' }} alt={artifact.title} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {artifact.file_url && (
                    <div style={{ padding: '20px', background: 'rgba(0,255,170,0.05)', border: '1px solid rgba(0,255,170,0.1)', borderRadius: '12px', display: 'flex', gap: 16, alignItems: 'center' }}>
                      <svg width="32" height="32" fill="none" stroke="var(--accent)" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Native File Available</div>
                        <div style={{ color: 'var(--accent)', fontSize: 13, marginTop: 4 }}>This artifact was successfully exported. Use the download button to access the native document.</div>
                      </div>
                    </div>
                  )}
                  <div style={{ fontFamily: 'Inter, sans-serif', whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.8 }}>
                    {previewText || "No text content available for this artifact."}
                  </div>
                  
                  {artifact.metadata && (
                    <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <label style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'var(--text-4)', display: 'block', marginBottom: 12 }}>
                        RAW METADATA
                      </label>
                      <pre style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        padding: '20px', 
                        borderRadius: '12px', 
                        fontSize: 12, 
                        color: 'var(--text-3)',
                        overflow: 'auto',
                        border: '1px solid rgba(255,255,255,0.05)'
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
