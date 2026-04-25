'use client'

import { useState } from 'react'
import { Artifact, ArtifactSources } from '@/types'
import Image from 'next/image'
import { SuggestedActionChips } from '@/components/suggested-actions/SuggestedActionChips'

interface Props {
  artifact: Artifact
  goalTitle?: string
  deptColor?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inferFilename(artifact: Artifact): { name: string; ext: string } {
  if (artifact.file_url) {
    const raw = artifact.file_url.split('/').pop()?.split('?')[0] ?? ''
    const parts = raw.split('.')
    if (parts.length >= 2) {
      const ext = parts.pop()!.toLowerCase()
      const name = parts.join('.')
      return { name: decodeURIComponent(name), ext }
    }
  }
  const title = artifact.title.replace(/[^a-zA-Z0-9\s_-]/g, '').replace(/\s+/g, '_')
  const extMap: Record<string, string> = {
    spreadsheet: 'xlsx',
    document: 'docx',
    image: 'png',
    data: 'json',
    code: 'txt',
    presentation: 'pptx',
    pdf: 'pdf',
  }
  const ext = extMap[artifact.artifact_type] ?? 'txt'
  return { name: title, ext }
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function extractPreviewText(raw: string | null): string {
  if (!raw) return 'No preview available.'
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
      if (topLevel) return topLevel.slice(0, 180)
      for (const v of Object.values(parsed)) {
        if (typeof v === 'object' && v !== null) {
          const nested = pick(v as any, ['summary', 'overview', 'description'])
          if (nested) return nested.slice(0, 180)
        }
      }
      return 'Structured data. Download to view full content.'
    }
    return stripped.slice(0, 180)
  } catch {
    return stripped.slice(0, 180)
  }
}

// ─── File Type Icon ───────────────────────────────────────────────────────────

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

function FileTypeIcon({ ext, size = 40 }: { ext: string; size?: number }) {
  const c = EXT_COLORS[ext] ?? { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-2)' }
  const s = { width: size, height: size, display: 'block' } as const
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 10,
      background: c.bg,
      color: c.fg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-dm-mono, monospace)',
      fontSize: size < 30 ? 9 : 11,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>
      {ext}
    </div>
  )
}

function ExtBadge({ ext }: { ext: string }) {
  const c = EXT_COLORS[ext] ?? { bg: 'rgba(255,255,255,0.06)', fg: 'var(--text-2)' }
  return (
    <span
      className="crost-badge"
      style={{
        background: c.bg,
        color: c.fg,
        borderColor: `${c.fg}20`,
      }}
    >
      {ext}
    </span>
  )
}

// ─── Citations Section ────────────────────────────────────────────────────────

function CitationsSection({ sources }: { sources?: ArtifactSources }) {
  const memoCount = sources?.memo_ids?.length ?? 0
  const kbCount = sources?.kb_file_ids?.length ?? 0
  const toolCount = sources?.tool_calls?.length ?? 0
  const hasAnySources = memoCount > 0 || kbCount > 0 || toolCount > 0

  return (
    <div>
      <div style={{
        fontSize: 10, color: 'var(--text-4)',
        fontFamily: 'var(--font-dm-mono, monospace)',
        letterSpacing: '0.08em', marginBottom: 10,
      }}>
        SOURCES
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {!hasAnySources ? (
          <span style={{ fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' }}>
            No citations recorded for this artefact.
          </span>
        ) : (
          <>
            {memoCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-dm-mono, monospace)',
                  color: 'rgba(90,171,255,0.9)',
                  background: 'rgba(40,130,255,0.08)',
                  border: '1px solid rgba(40,130,255,0.18)',
                  borderRadius: 5, padding: '2px 7px',
                }}>MEMOS</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {memoCount} memo{memoCount !== 1 ? 's' : ''} referenced
                </span>
              </div>
            )}
            {kbCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-dm-mono, monospace)',
                  color: 'rgba(0,200,150,0.9)',
                  background: 'rgba(0,200,150,0.08)',
                  border: '1px solid rgba(0,200,150,0.18)',
                  borderRadius: 5, padding: '2px 7px',
                }}>KB FILES</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {kbCount} knowledge base file{kbCount !== 1 ? 's' : ''} referenced
                </span>
              </div>
            )}
            {toolCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontFamily: 'var(--font-dm-mono, monospace)',
                  color: 'rgba(255,180,0,0.9)',
                  background: 'rgba(255,180,0,0.08)',
                  border: '1px solid rgba(255,180,0,0.18)',
                  borderRadius: 5, padding: '2px 7px',
                }}>TOOLS</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {toolCount} tool call{toolCount !== 1 ? 's' : ''} made
                </span>
                <details style={{ marginLeft: 4 }}>
                  <summary style={{ fontSize: 11, color: 'var(--text-4)', cursor: 'pointer', listStyle: 'none' }}>
                    details ▾
                  </summary>
                  <pre style={{
                    marginTop: 8,
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 6,
                    padding: '8px 10px',
                    fontSize: 10,
                    color: 'var(--text-3)',
                    overflow: 'auto',
                    border: '1px solid rgba(255,255,255,0.06)',
                    maxHeight: 140,
                  }}>
                    {JSON.stringify(sources!.tool_calls, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ArtifactCard({ artifact, goalTitle, deptColor }: Props) {
  const [showDrawer, setShowDrawer] = useState(false)
  const [activeTab, setActiveTab] = useState<'preview' | 'details'>('preview')
  const [downloading, setDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const createdAt = new Date(artifact.created_at)
  const { name, ext } = inferFilename(artifact)
  const displayFilename = `${name}.${ext}`
  const previewText = extractPreviewText(artifact.body)
  const fileSize = formatBytes(artifact.file_size)
  const iconColor = EXT_COLORS[ext]?.fg ?? 'var(--accent)'
  const iconBg = EXT_COLORS[ext]?.bg ?? 'rgba(0,255,170,0.08)'
  const deptBadgeColor = deptColor || iconColor

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
        // No fallback to body — file_url is required per spec
        throw new Error('No downloadable file available')
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
      {/* ── Card ─────────────────────────────────────────────── */}
      <div
        className="artifact-card"
        onClick={() => { setShowDrawer(true); setActiveTab('preview'); setMenuOpen(false) }}
        style={{
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: 16,
          cursor: 'pointer',
          transition: 'all 0.15s',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          position: 'relative',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
        }}
      >
        {/* Thumbnail area */}
        <div style={{
          width: '100%',
          aspectRatio: '16/10',
          borderRadius: 10,
          background: 'rgba(0,0,0,0.25)',
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {artifact.artifact_type === 'image' && (artifact.preview_url || artifact.file_url) ? (
            <Image
              src={artifact.preview_url || artifact.file_url!}
              fill
              unoptimized
              style={{ objectFit: 'cover' }}
              alt={artifact.title}
            />
          ) : (
            <FileTypeIcon ext={ext} size={48} />
          )}
        </div>

        {/* Title */}
        <div style={{
          fontFamily: 'var(--font-dm-sans, sans-serif)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text)',
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {artifact.title}
        </div>

        {/* Department badge + Goal tag */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{
            fontSize: 10,
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: deptBadgeColor,
            background: `${deptBadgeColor}15`,
            border: `1px solid ${deptBadgeColor}25`,
            borderRadius: 5,
            padding: '3px 8px',
          }}>
            {artifact.department_slug}
          </span>
          {goalTitle && (
            <span style={{
              fontSize: 10,
              fontFamily: 'var(--font-dm-mono, monospace)',
              color: 'var(--text-4)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 5,
              padding: '3px 8px',
            }}>
              {goalTitle}
            </span>
          )}
        </div>

        {/* Meta row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'var(--text-4)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          marginTop: 'auto',
        }}>
          <span>{timeAgo(artifact.created_at)}</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>•</span>
          <ExtBadge ext={ext} />
          {fileSize && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>•</span>
              <span>{fileSize}</span>
            </>
          )}
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o) }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-4)',
                cursor: 'pointer',
                padding: '4px 6px',
                borderRadius: 4,
                fontSize: 16,
                lineHeight: 1,
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                right: 0,
                background: 'rgba(30,30,36,0.98)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                padding: '6px 0',
                minWidth: 140,
                zIndex: 50,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}>
                <button
                  onClick={downloadArtifact}
                  disabled={downloading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-2)',
                    fontSize: 12,
                    fontFamily: 'var(--font-dm-sans, sans-serif)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  Download
                </button>
                <button
                  onClick={deleteArtifact}
                  disabled={isDeleting}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 14px',
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,90,90,0.9)',
                    fontSize: 12,
                    fontFamily: 'var(--font-dm-sans, sans-serif)',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Detail Drawer ─────────────────────────────────────── */}
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
                  <FileTypeIcon ext={ext} size={28} />
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

            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              padding: '0 28px',
              gap: 20,
            }}>
              {(['preview', 'details'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '14px 0 12px',
                    background: 'none',
                    border: 'none',
                    borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                    color: activeTab === tab ? 'var(--text)' : 'var(--text-4)',
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'var(--font-dm-sans, sans-serif)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    transition: 'all 0.15s',
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {activeTab === 'preview' ? (
                <>
                  {artifact.artifact_type === 'image' && (artifact.preview_url || artifact.file_url) ? (
                    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden' }}>
                      <Image src={artifact.preview_url || artifact.file_url!} fill unoptimized style={{ objectFit: 'contain', borderRadius: 12 }} alt={artifact.title} />
                    </div>
                  ) : (
                    <>
                      {/* PDF: native browser inline viewer */}
                      {artifact.artifact_type === 'pdf' && artifact.file_url && (
                        <iframe
                          src={artifact.file_url}
                          style={{ width: '100%', height: 420, border: 'none', borderRadius: 10, background: '#fff' }}
                          title={displayFilename}
                        />
                      )}

                      {/* PPTX / DOCX / XLSX: Office Online embed */}
                      {['presentation', 'document', 'spreadsheet'].includes(artifact.artifact_type) && artifact.file_url && (
                        <iframe
                          src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(artifact.file_url)}`}
                          style={{ width: '100%', height: 420, border: 'none', borderRadius: 10 }}
                          title={displayFilename}
                          sandbox="allow-scripts allow-same-origin allow-popups"
                        />
                      )}

                      {/* Data / code / unknown: show "native file" badge */}
                      {!['pdf', 'presentation', 'document', 'spreadsheet'].includes(artifact.artifact_type) && artifact.file_url && (
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
                    </>
                  )}
                </>
              ) : (
                /* Details Tab */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{
                    fontSize: 10, color: 'var(--text-4)',
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    letterSpacing: '0.08em',
                  }}>
                    METADATA
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr',
                    gap: '10px 0',
                    fontSize: 13,
                    fontFamily: 'Inter, sans-serif',
                  }}>
                    {[
                      ['Type', artifact.artifact_type],
                      ['Format', ext.toUpperCase()],
                      ['Created by', artifact.department_slug],
                      ['Created at', createdAt.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' })],
                      ['Size', fileSize || '—'],
                      ['Goal', goalTitle || '—'],
                      ['Task', artifact.task_id ? artifact.task_id.slice(0, 8) + '…' : '—'],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: 'contents' }}>
                        <div style={{ color: 'var(--text-4)', fontWeight: 500 }}>{label}</div>
                        <div style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {artifact.skills_used && artifact.skills_used.length > 0 && (
                    <div>
                      <div style={{
                        fontSize: 10, color: 'var(--text-4)',
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        letterSpacing: '0.08em', marginBottom: 10,
                      }}>
                        SKILLS USED
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {artifact.skills_used.map(skill => (
                          <span key={skill} style={{
                            fontSize: 11,
                            color: 'var(--text-3)',
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 5,
                            padding: '3px 8px',
                            fontFamily: 'var(--font-dm-mono, monospace)',
                          }}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Citations — Sources footer (Spec §9) */}
              <CitationsSection sources={artifact.sources} />

              {/* Contextual Action Chips */}
              <SuggestedActionChips entityType="artifact" entityId={artifact.id} />
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
