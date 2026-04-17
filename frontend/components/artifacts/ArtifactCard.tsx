'use client'

import { useState } from 'react'
import { Artifact } from '@/types'
import Image from 'next/image'

interface Props {
  artifact: Artifact
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferFilename(artifact: Artifact): { name: string; ext: string } {
  // 1. Try to pull from the storage URL (most accurate)
  if (artifact.file_url) {
    const raw = artifact.file_url.split('/').pop()?.split('?')[0] ?? ''
    const parts = raw.split('.')
    if (parts.length >= 2) {
      const ext = parts.pop()!.toLowerCase()
      const name = parts.join('.')
      return { name: decodeURIComponent(name), ext }
    }
  }

  // 2. Fallback: derive from artifact type + title
  const title = artifact.title.replace(/[^a-zA-Z0-9\s_-]/g, '').replace(/\s+/g, '_')
  const extMap: Record<string, string> = {
    spreadsheet: 'xlsx',
    document: 'docx',
    image: 'png',
    data: 'json',
    code: 'txt',
  }
  const ext = extMap[artifact.artifact_type] ?? 'txt'
  return { name: title, ext }
}

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function extractPreviewText(raw: string | null, file_url?: string | null): string {
  if (!raw) {
    if (file_url) return 'Native file attached. Use the Download button to retrieve it.'
    return 'No preview available.'
  }
  const stripped = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(stripped)
    if (typeof parsed === 'object' && parsed !== null) {
      const pick = (obj: any, keys: string[]): string => {
        for (const k of keys) {
          if (typeof obj[k] === 'string' && obj[k].length > 10) return obj[k]
        }
        const vals = Object.values(obj).filter(v => typeof v === 'string' && (v as string).length > 10) as string[]
        return vals[0] ?? ''
      }
      const topLevel = pick(parsed, ['summary', 'executive_summary', 'overview', 'description', 'title'])
      if (topLevel) return topLevel.slice(0, 280)
      // Nested
      for (const v of Object.values(parsed)) {
        if (typeof v === 'object' && v !== null) {
          const nested = pick(v as any, ['summary', 'overview', 'description'])
          if (nested) return nested.slice(0, 280)
        }
      }
      return `Structured ${artifact_type_label(parsed)} data. Download to view full content.`
    }
    return stripped.slice(0, 280)
  } catch {
    return stripped.slice(0, 280)
  }
}

function artifact_type_label(obj: any): string {
  if ('analysis' in obj) return 'Financial'
  if ('strategy' in obj) return 'Strategy'
  if ('marketing' in obj) return 'Marketing'
  return 'Work'
}

// ─── File Type Icon ───────────────────────────────────────────────────────────

function FileTypeIcon({ ext, size = 20 }: { ext: string; size?: number }) {
  const s = { width: size, height: size, display: 'block' } as const
  switch (ext) {
    case 'xlsx':
    case 'csv':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
        </svg>
      )
    case 'docx':
    case 'doc':
    case 'md':
    case 'txt':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="8" y1="13" x2="16" y2="13"/>
          <line x1="8" y1="17" x2="16" y2="17"/>
        </svg>
      )
    case 'json':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="16 18 22 12 16 6"/>
          <polyline points="8 6 2 12 8 18"/>
        </svg>
      )
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      )
    default:
      return (
        <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      )
  }
}

// ─── Extension Badge ──────────────────────────────────────────────────────────

const EXT_COLORS: Record<string, { bg: string; fg: string }> = {
  xlsx: { bg: 'rgba(0,180,100,0.12)', fg: '#00c866' },
  csv:  { bg: 'rgba(0,180,100,0.12)', fg: '#00c866' },
  docx: { bg: 'rgba(40,130,255,0.12)', fg: '#5aabff' },
  doc:  { bg: 'rgba(40,130,255,0.12)', fg: '#5aabff' },
  pdf:  { bg: 'rgba(255,70,70,0.12)',  fg: '#ff7070' },
  png:  { bg: 'rgba(200,100,255,0.12)', fg: '#cc66ff' },
  jpg:  { bg: 'rgba(200,100,255,0.12)', fg: '#cc66ff' },
  json: { bg: 'rgba(255,180,0,0.12)', fg: '#ffb800' },
  md:   { bg: 'rgba(80,200,255,0.12)', fg: '#50c8ff' },
}

function ExtBadge({ ext }: { ext: string }) {
  const c = EXT_COLORS[ext] ?? { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-2)' }
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 5,
      fontSize: 10,
      fontFamily: 'var(--font-dm-mono, monospace)',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      background: c.bg,
      color: c.fg,
      border: `1px solid ${c.fg}20`,
    }}>
      {ext}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ArtifactCard({ artifact }: Props) {
  const [showDrawer, setShowDrawer] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const createdAt = new Date(artifact.created_at)
  const { name, ext } = inferFilename(artifact)
  const displayFilename = `${name}.${ext}`
  const previewText = extractPreviewText(artifact.body, artifact.file_url)
  const fileSize = (artifact as any).file_size ? formatBytes((artifact as any).file_size) : null
  const iconColor = EXT_COLORS[ext]?.fg ?? 'var(--accent)'
  const iconBg   = EXT_COLORS[ext]?.bg ?? 'rgba(0,255,170,0.08)'

  const downloadArtifact = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setDownloading(true)
    try {
      let downloadUrl = ''
      let fileName = displayFilename

      if (artifact.file_url) {
        const res = await fetch(artifact.file_url)
        const blob = await res.blob()
        downloadUrl = URL.createObjectURL(blob)
        fileName = artifact.file_url.split('/').pop()?.split('?')[0] ?? displayFilename
      } else if (artifact.preview_url) {
        const res = await fetch(artifact.preview_url)
        const blob = await res.blob()
        downloadUrl = URL.createObjectURL(blob)
      } else {
        const content = artifact.body || JSON.stringify(artifact.metadata, null, 2)
        const mime = ext === 'json' ? 'application/json' : ext === 'md' ? 'text/markdown' : 'text/plain'
        const blob = new Blob([content], { type: mime })
        downloadUrl = URL.createObjectURL(blob)
      }

      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
    } catch (err) {
      console.error('[Download Failed]', err)
      window.open(artifact.file_url || artifact.preview_url || '', '_blank')
    } finally {
      setDownloading(false)
    }
  }

  const deleteArtifact = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this artifact? This cannot be undone.')) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      window.location.reload()
    } catch {
      alert('Failed to delete artifact. Please try again.')
      setIsDeleting(false)
    }
  }

  return (
    <>
      {/* ── File Row Card ────────────────────────────────────────── */}
      <div
        className="artifact-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '14px 18px',
          borderRadius: 12,
          background: isHovered ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${isHovered ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)'}`,
          cursor: 'pointer',
          transition: 'all 0.18s ease',
          transform: isHovered ? 'translateX(2px)' : 'none',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setShowDrawer(true)}
      >
        {/* Icon */}
        <div style={{
          width: 40, height: 40,
          borderRadius: 10,
          background: iconBg,
          border: `1px solid ${iconColor}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: iconColor,
          flexShrink: 0,
        }}>
          <FileTypeIcon ext={ext} size={18} />
        </div>

        {/* Name + Meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap'
          }}>
            <span style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 280,
            }}>
              {displayFilename}
            </span>
            <ExtBadge ext={ext} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
              {artifact.department_slug}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>•</span>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
              {createdAt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            {fileSize && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 10 }}>•</span>
                <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                  {fileSize}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button
            id={`download-artifact-${artifact.id}`}
            onClick={downloadArtifact}
            disabled={downloading}
            title={`Download ${displayFilename}`}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              fontFamily: 'var(--font-dm-sans, sans-serif)',
              fontWeight: 600,
              fontSize: 12,
              background: downloading ? 'rgba(0,255,170,0.5)' : 'var(--accent)',
              color: '#000',
              border: 'none',
              cursor: downloading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
              boxShadow: '0 2px 8px rgba(0,255,170,0.15)',
              transition: 'all 0.15s',
            }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            {downloading ? '…' : 'Download'}
          </button>
          <button
            id={`delete-artifact-${artifact.id}`}
            onClick={deleteArtifact}
            disabled={isDeleting}
            title="Delete artifact"
            style={{
              padding: '6px 10px',
              borderRadius: 8,
              background: 'rgba(255,60,60,0.08)',
              color: 'rgba(255,90,90,0.8)',
              border: '1px solid rgba(255,60,60,0.15)',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center',
              opacity: isDeleting ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.18)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.08)' }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────────── */}
      {showDrawer && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            animation: 'fadeIn 0.15s ease-out',
          }}
          onClick={() => setShowDrawer(false)}
        >
          <div
            style={{
              width: 520,
              maxWidth: '95vw',
              height: '100%',
              background: 'linear-gradient(180deg, rgba(26,26,32,1) 0%, rgba(18,18,22,1) 100%)',
              borderLeft: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '-24px 0 60px rgba(0,0,0,0.5)',
              animation: 'slideInRight 0.22s cubic-bezier(0.2,0.8,0.2,1)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{
              padding: '24px 28px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.01)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 48, height: 48,
                  borderRadius: 12,
                  background: iconBg,
                  border: `1px solid ${iconColor}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: iconColor, flexShrink: 0,
                }}>
                  <FileTypeIcon ext={ext} size={22} />
                </div>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 14, fontWeight: 700,
                    color: 'var(--text)', marginBottom: 5,
                    wordBreak: 'break-all',
                  }}>
                    {displayFilename}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ExtBadge ext={ext} />
                    {fileSize && (
                      <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)' }}>
                        {fileSize}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowDrawer(false)}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-3)',
                  fontSize: 18, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Metadata Row */}
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: 0,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              {[
                { label: 'DEPARTMENT', value: artifact.department_slug },
                { label: 'CREATED', value: createdAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' }) },
                { label: 'TYPE', value: artifact.artifact_type },
                { label: 'FORMAT', value: ext.toUpperCase() },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  padding: '14px 20px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  borderRight: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'Inter, sans-serif', fontWeight: 500 }}>
                    {value}
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {artifact.artifact_type === 'image' && artifact.preview_url ? (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden' }}>
                  <Image src={artifact.preview_url} fill unoptimized style={{ objectFit: 'contain', borderRadius: 12 }} alt={artifact.title} />
                </div>
              ) : (
                <>
                  {artifact.file_url && (
                    <div style={{
                      padding: '16px 18px',
                      background: `${iconBg}`,
                      border: `1px solid ${iconColor}20`,
                      borderRadius: 12,
                      display: 'flex', alignItems: 'center', gap: 14,
                    }}>
                      <div style={{ color: iconColor }}>
                        <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                      </div>
                      <div>
                        <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>Native File Available</div>
                        <div style={{ color: 'var(--text-3)', fontSize: 12, marginTop: 2 }}>
                          Exported as <strong style={{ color: iconColor }}>.{ext}</strong> — download to open in your native application.
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)', letterSpacing: '0.08em', marginBottom: 10 }}>
                      CONTENT PREVIEW
                    </div>
                    <div style={{
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 14,
                      lineHeight: 1.75,
                      color: 'var(--text-2)',
                      whiteSpace: 'pre-wrap',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: 10,
                      padding: '16px 18px',
                    }}>
                      {previewText}
                    </div>
                  </div>

                  {artifact.metadata && Object.keys(artifact.metadata).length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)', letterSpacing: '0.08em', marginBottom: 10 }}>
                        METADATA
                      </div>
                      <pre style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '16px 18px',
                        borderRadius: 10,
                        fontSize: 11,
                        color: 'var(--text-3)',
                        overflow: 'auto',
                        border: '1px solid rgba(255,255,255,0.06)',
                        margin: 0,
                      }}>
                        {JSON.stringify(artifact.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Drawer Footer */}
            <div style={{
              padding: '18px 28px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', gap: 10,
              background: 'rgba(0,0,0,0.2)',
            }}>
              <button
                id={`drawer-download-${artifact.id}`}
                onClick={downloadArtifact}
                disabled={downloading}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 10,
                  background: 'var(--accent)',
                  color: '#000',
                  border: 'none',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: downloading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 14px rgba(0,255,170,0.2)',
                  transition: 'all 0.15s',
                }}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                {downloading ? 'Downloading…' : `Download ${displayFilename}`}
              </button>
              <button
                id={`drawer-delete-${artifact.id}`}
                onClick={deleteArtifact}
                disabled={isDeleting}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  background: 'rgba(255,60,60,0.08)',
                  color: 'rgba(255,90,90,0.9)',
                  border: '1px solid rgba(255,60,60,0.2)',
                  fontFamily: 'var(--font-dm-sans, sans-serif)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.08)' }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
