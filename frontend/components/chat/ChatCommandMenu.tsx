'use client'

import { useEffect, useRef } from 'react'
import type { Department } from '@/types'

// ─── Built-in tool catalogue shown for / prefix ───────────────────────────────

const TOOL_CATALOGUE = [
  {
    id: 'knowledge_base_search',
    label: 'Knowledge Base Search',
    description: 'Search your uploaded documents',
    icon: '📚',
  },
  {
    id: 'gmail.send_email',
    label: 'Gmail — Send Email',
    description: 'Send an email via Gmail',
    icon: '✉️',
  },
  {
    id: 'gmail.search_emails',
    label: 'Gmail — Search',
    description: 'Search emails in Gmail',
    icon: '🔍',
  },
  {
    id: 'slack.post_message',
    label: 'Slack — Post Message',
    description: 'Post a message to a Slack channel',
    icon: '💬',
  },
  {
    id: 'github.create_pull_request',
    label: 'GitHub — Create PR',
    description: 'Open a pull request',
    icon: '🔀',
  },
  {
    id: 'github.list_pull_requests',
    label: 'GitHub — List PRs',
    description: 'List open pull requests',
    icon: '📋',
  },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type DeptEntry = {
  kind: 'dept'
  slug: string
  name: string
  icon: string
  color: string
}

type ToolEntry = {
  kind: 'tool'
  id: string
  label: string
  description: string
  icon: string
}

type Entry = DeptEntry | ToolEntry

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  prefix: '@' | '/'
  query: string
  departments: Department[]
  selectedIndex: number
  onSelect: (completion: string) => void
  onClose: () => void
}

export function ChatCommandMenu({
  prefix,
  query,
  departments,
  selectedIndex,
  onSelect,
  onClose,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  const entries: Entry[] =
    prefix === '@'
      ? departments
          .filter(
            d =>
              !d.is_orchestrator &&
              (d.slug.toLowerCase().includes(query.toLowerCase()) ||
                d.name.toLowerCase().includes(query.toLowerCase())),
          )
          .map(d => ({
            kind: 'dept' as const,
            slug: d.slug,
            name: d.name,
            icon: d.icon || '🏢',
            color: d.color || '#6366f1',
          }))
      : TOOL_CATALOGUE.filter(
          t =>
            t.id.toLowerCase().includes(query.toLowerCase()) ||
            t.label.toLowerCase().includes(query.toLowerCase()),
        ).map(t => ({ kind: 'tool' as const, ...t }))

  // Keep selected item visible
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (entries.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 6px)',
        left: 0,
        right: 0,
        background: 'var(--bg-2, #1a1a20)',
        border: '1px solid var(--border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: '0 -12px 40px rgba(0,0,0,0.5)',
        zIndex: 50,
        maxHeight: 260,
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '6px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          fontSize: 10,
          color: 'var(--text-4)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          letterSpacing: '0.08em',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            color: prefix === '@' ? '#00D4AA' : '#a78bfa',
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          {prefix}
        </span>
        {prefix === '@' ? 'ROUTE TO DEPARTMENT' : 'INVOKE TOOL'}
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>↑↓ navigate · ↵ select · Esc close</span>
      </div>

      {/* Entries */}
      <div ref={listRef}>
        {entries.map((entry, i) => {
          const isSelected = i === selectedIndex
          return (
            <div
              key={entry.kind === 'dept' ? entry.slug : entry.id}
              onClick={() =>
                onSelect(
                  entry.kind === 'dept' ? `@${entry.slug} ` : `/${entry.id} `,
                )
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 14px',
                cursor: 'pointer',
                background: isSelected
                  ? 'rgba(255,255,255,0.06)'
                  : 'transparent',
                transition: 'background 0.1s',
                borderLeft: isSelected
                  ? `2px solid ${entry.kind === 'dept' ? (entry as DeptEntry).color : '#a78bfa'}`
                  : '2px solid transparent',
              }}
              onMouseEnter={e =>
                ((e.currentTarget as HTMLElement).style.background =
                  'rgba(255,255,255,0.04)')
              }
              onMouseLeave={e =>
                ((e.currentTarget as HTMLElement).style.background = isSelected
                  ? 'rgba(255,255,255,0.06)'
                  : 'transparent')
              }
            >
              <span style={{ fontSize: 16, width: 22, textAlign: 'center', flexShrink: 0 }}>
                {entry.icon}
              </span>

              {entry.kind === 'dept' ? (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: 'var(--text)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-dm-sans, sans-serif)',
                      }}
                    >
                      {entry.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: 'var(--text-4)',
                        fontFamily: 'var(--font-dm-mono, monospace)',
                      }}
                    >
                      @{entry.slug}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: entry.color,
                      background: `${entry.color}20`,
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-dm-mono, monospace)',
                      flexShrink: 0,
                    }}
                  >
                    dept
                  </span>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text)',
                        fontWeight: 600,
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      /{entry.id}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
                      {entry.description}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#a78bfa',
                      background: 'rgba(167,139,250,0.12)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      fontFamily: 'var(--font-dm-mono, monospace)',
                      flexShrink: 0,
                    }}
                  >
                    tool
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
