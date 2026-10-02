'use client'

// Deliverables: one simple card + one simple reading panel.
// No embedded viewers (the bucket is private, so Office/PDF iframes and direct
// file URLs render blank), no tabs, no lineage/citations — just the content,
// in plain text, and the actions that apply to its status.

import { useEffect, useMemo, useState } from 'react'
import { Artifact } from '@/types'
import { ConfirmationModal } from '@/components/ui/ConfirmationModal'
import { toast } from '@/components/ui/toaster'
import { displayTitle, downloadFileName, fileExtension, toReadableView, ReadableView } from '@/lib/artifact-view'

interface Props {
  artifact: Artifact
  goalTitle?: string
  deptColor?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateString).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function snippet(view: ReadableView): string {
  const text = view.summary || view.sections[0]?.text || (view.files[0] ? `${view.files.length} file${view.files.length === 1 ? '' : 's'}` : '')
  return text.replace(/\s+/g, ' ').slice(0, 160)
}

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Draft',     color: 'var(--amber)',  bg: 'rgba(183,121,31,0.10)' },
  review:     { label: 'In review', color: 'var(--blue)',   bg: 'rgba(47,111,214,0.10)' },
  active:     { label: 'Approved',  color: 'var(--accent)', bg: 'var(--accent-dim)' },
  paused:     { label: 'Paused',    color: 'var(--text-3)', bg: 'var(--bg-3)' },
  deprecated: { label: 'Archived',  color: 'var(--text-3)', bg: 'var(--bg-3)' },
}

function StatusPill({ status }: { status?: string }) {
  const s = STATUS_LABEL[status ?? 'draft'] ?? STATUS_LABEL.draft
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--font-dm-mono)', fontWeight: 600, letterSpacing: '0.05em',
      textTransform: 'uppercase', color: s.color, background: s.bg, borderRadius: 6, padding: '2px 8px',
    }}>
      {s.label}
    </span>
  )
}

function ExtLabel({ ext }: { ext: string | null }) {
  if (!ext) return null
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--font-dm-mono)', fontWeight: 600, letterSpacing: '0.05em',
      textTransform: 'uppercase', color: 'var(--text-2)', background: 'var(--bg-3)',
      border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px',
    }}>
      {ext}
    </span>
  )
}

const btnBase: React.CSSProperties = {
  padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600,
  fontFamily: 'var(--font-dm-sans, sans-serif)', cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function ArtifactCard({ artifact, goalTitle, deptColor }: Props) {
  const [open, setOpen] = useState(false)
  const [fullBody, setFullBody] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const title = displayTitle(artifact.title)
  const ext = fileExtension(artifact.file_url)
  const size = formatBytes(artifact.file_size)
  const status = artifact.status ?? 'draft'

  const listView = useMemo(() => toReadableView(artifact.body), [artifact.body])
  const view = useMemo(() => (fullBody !== null ? toReadableView(fullBody) : listView), [fullBody, listView])

  // The list query truncates bodies; load the full one when the panel opens.
  useEffect(() => {
    if (!open || fullBody !== null) return
    let cancelled = false
    fetch(`/api/artifacts/${artifact.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled) setFullBody(typeof j?.data?.body === 'string' ? j.data.body : artifact.body ?? '') })
      .catch(() => { if (!cancelled) setFullBody(artifact.body ?? '') })
    return () => { cancelled = true }
  }, [open, fullBody, artifact.id, artifact.body])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const download = async () => {
    if (!artifact.file_url) { toast('This deliverable has no file to download.', 'error'); return }
    setDownloading(true)
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/download`)
      if (!res.ok) throw new Error(String(res.status))
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = downloadFileName(artifact.title, ext)
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast('Download failed. Please try again.', 'error')
    } finally {
      setDownloading(false)
    }
  }

  const setStatus = async (next: string, okMsg: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(err.error || 'Could not update this deliverable.', 'error')
        return
      }
      toast(okMsg, 'success')
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  const makeChanges = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}/make-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(err.error || 'Could not start a new version.', 'error')
        return
      }
      toast('A new version is being prepared.', 'success')
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  const discard = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/artifacts/${artifact.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast(err.error || 'Could not discard this deliverable.', 'error')
        return
      }
      toast('Deliverable discarded', 'success')
      window.location.reload()
    } finally {
      setBusy(false)
      setConfirmDiscard(false)
    }
  }

  const cardSnippet = snippet(listView)

  return (
    <>
      <ConfirmationModal
        isOpen={confirmDiscard}
        title="Discard deliverable"
        message={`Discard "${title}"? This cannot be undone.`}
        confirmLabel={busy ? 'Discarding…' : 'Discard'}
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
        isDanger
      />

      {/* ── Card ── */}
      <button
        type="button"
        className="artifact-card"
        onClick={() => setOpen(true)}
        style={{
          textAlign: 'left', width: '100%', cursor: 'pointer',
          background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 16, display: 'flex', flexDirection: 'column', gap: 10,
          color: 'var(--text)', font: 'inherit', transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-bright)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <ExtLabel ext={ext} />
          {status !== 'active' && <StatusPill status={status} />}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.35, color: 'var(--text)' }}>
          {title}
        </div>
        {cardSnippet && (
          <div style={{
            fontSize: 13, lineHeight: 1.5, color: 'var(--text-3)', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {cardSnippet}
          </div>
        )}
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto',
          fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono)',
        }}>
          <span style={{ color: deptColor || 'var(--text-3)', textTransform: 'capitalize' }}>{artifact.department_slug}</span>
          <span>·</span>
          <span>{timeAgo(artifact.created_at)}</span>
          {size && (<><span>·</span><span>{size}</span></>)}
        </div>
      </button>

      {/* ── Reading panel ── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(28,25,23,0.18)',
            display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={e => e.stopPropagation()}
            style={{
              width: 'min(600px, 100vw)', height: '100%', background: 'var(--bg-2)', color: 'var(--text)',
              borderLeft: '1px solid var(--border)', boxShadow: '-16px 0 40px rgba(28,25,23,0.08)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{
                  fontFamily: 'var(--font-syne, Fraunces), serif', fontSize: 20, fontWeight: 600,
                  lineHeight: 1.3, margin: '0 0 8px', color: 'var(--text)', overflowWrap: 'anywhere',
                }}>
                  {title}
                </h2>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                  <StatusPill status={status} />
                  <ExtLabel ext={ext} />
                  <span style={{ textTransform: 'capitalize' }}>{artifact.department_slug}</span>
                  <span>·</span>
                  <span>{new Date(artifact.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {size && (<><span>·</span><span>{size}</span></>)}
                </div>
                {goalTitle && (
                  <div style={{ fontSize: 12, color: 'var(--text-4)', marginTop: 6 }}>From: {goalTitle}</div>
                )}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)',
                  background: 'var(--bg)', color: 'var(--text-2)', fontSize: 18, lineHeight: 1,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {artifact.artifact_type === 'image' && artifact.file_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/artifacts/${artifact.id}/download`}
                  alt={title}
                  style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)' }}
                />
              )}

              {view.summary && (
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: 'var(--text-2)' }}>{view.summary}</p>
              )}

              {view.sections.map((s, i) => (
                <section key={i}>
                  {s.heading && (
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px', color: 'var(--text)' }}>{s.heading}</h3>
                  )}
                  <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {s.text}
                  </div>
                </section>
              ))}

              {view.files.map((f, i) => (
                <section key={`f${i}`}>
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-dm-mono)', color: 'var(--text-3)', marginBottom: 6 }}>{f.name}</div>
                  <pre style={{
                    margin: 0, padding: 14, background: 'var(--bg)', border: '1px solid var(--border)',
                    borderRadius: 10, fontSize: 12, lineHeight: 1.55, color: 'var(--text)',
                    fontFamily: 'var(--font-dm-mono), monospace', overflow: 'auto', maxHeight: 420,
                  }}>
                    {f.code}
                  </pre>
                </section>
              ))}

              {!view.summary && view.sections.length === 0 && view.files.length === 0 && (
                <div style={{ fontSize: 14, color: 'var(--text-3)' }}>
                  {fullBody === null ? 'Loading…' : 'Nothing to show here. Download the file to open it.'}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {artifact.file_url && (
                <button
                  type="button"
                  onClick={download}
                  disabled={downloading}
                  style={{ ...btnBase, background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff', flex: '1 1 140px' }}
                >
                  {downloading ? 'Downloading…' : `Download${ext ? ` .${ext}` : ''}`}
                </button>
              )}
              {status === 'draft' && (
                <button type="button" disabled={busy} onClick={() => setStatus('review', 'Sent for review')} style={btnBase}>
                  Send for review
                </button>
              )}
              {status === 'review' && (
                <button type="button" disabled={busy} onClick={() => setStatus('active', 'Approved')} style={btnBase}>
                  Approve
                </button>
              )}
              {['review', 'active', 'paused'].includes(status) && (
                <button type="button" disabled={busy} onClick={makeChanges} style={btnBase}>
                  Make changes
                </button>
              )}
              {['active', 'paused'].includes(status) && (
                <button type="button" disabled={busy} onClick={() => setStatus('deprecated', 'Archived')} style={btnBase}>
                  Archive
                </button>
              )}
              {['draft', 'review'].includes(status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDiscard(true)}
                  style={{ ...btnBase, color: 'var(--red)', borderColor: 'rgba(200,55,45,0.25)' }}
                >
                  Discard
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
