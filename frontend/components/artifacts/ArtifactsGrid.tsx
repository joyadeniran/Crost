'use client'

import { useState, useMemo } from 'react'
import { Artifact } from '@/types'
import { ArtifactCard } from './ArtifactCard'

interface Props {
  initialArtifacts: Artifact[]
  goalMap: Map<string, string>
  deptColorMap: Map<string, string>
}

type FilterType = 'all' | 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'image' | 'data' | 'code'
type ViewTab = 'gallery' | 'sandbox'

const GALLERY_STATUSES = new Set(['review', 'active', 'paused', 'deprecated'])
const SANDBOX_STATUSES = new Set(['draft'])

export function ArtifactsGrid({ initialArtifacts, goalMap, deptColorMap }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [activeView, setActiveView] = useState<ViewTab>('gallery')

  const sandboxCount = useMemo(
    () => initialArtifacts.filter(a => SANDBOX_STATUSES.has(a.status ?? '')).length,
    [initialArtifacts]
  )

  const filteredArtifacts = useMemo(() => {
    const visibleStatuses = activeView === 'sandbox' ? SANDBOX_STATUSES : GALLERY_STATUSES
    return initialArtifacts.filter(artifact => {
      const matchesView = visibleStatuses.has(artifact.status ?? 'review')
      const matchesSearch = artifact.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (goalMap.get(artifact.goal_id ?? '') ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === 'all' || artifact.artifact_type === activeFilter
      return matchesView && matchesSearch && matchesFilter
    })
  }, [initialArtifacts, searchTerm, activeFilter, activeView, goalMap])

  const filterOptions: { label: string, value: FilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Documents', value: 'document' },
    { label: 'Spreadsheets', value: 'spreadsheet' },
    { label: 'Presentations', value: 'presentation' },
    { label: 'PDFs', value: 'pdf' },
    { label: 'Images', value: 'image' },
    { label: 'Data', value: 'data' },
    { label: 'Code', value: 'code' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Gallery / Sandbox tabs */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {(['gallery', 'sandbox'] as ViewTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            style={{
              padding: '7px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--font-dm-mono, monospace)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              background: activeView === tab ? 'var(--accent)' : 'var(--bg-3)',
              color: activeView === tab ? '#000' : 'var(--text-3)',
              border: activeView === tab ? '1px solid var(--accent)' : '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {tab === 'gallery' ? 'Gallery' : 'Sandbox'}
            {tab === 'sandbox' && sandboxCount > 0 && (
              <span style={{
                background: activeView === 'sandbox' ? 'rgba(0,0,0,0.2)' : 'rgba(245,166,35,0.2)',
                color: activeView === 'sandbox' ? '#000' : '#f5a623',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: 10,
              }}>
                {sandboxCount}
              </span>
            )}
          </button>
        ))}
        {activeView === 'sandbox' && (
          <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-dm-mono, monospace)', marginLeft: 4 }}>
            Drafts awaiting your review — approve or discard before they appear in Gallery
          </span>
        )}
      </div>

      {/* Search and Filters */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: '16px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 12,
        border: '1px solid var(--border)'
      }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type="text"
            placeholder="Search artifacts or goals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--bg-3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 14,
              color: 'var(--text)',
              outline: 'none'
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-dm-mono, monospace)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeFilter === opt.value ? 'var(--accent)' : 'var(--bg-3)',
                color: activeFilter === opt.value ? '#000' : 'var(--text-3)',
                border: activeFilter === opt.value ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filteredArtifacts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 13,
          background: 'rgba(255,255,255,0.01)',
          borderRadius: 16,
          border: '1px dashed rgba(255,255,255,0.05)',
        }}>
          No results found matching your search and filter.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}>
          {filteredArtifacts.map(artifact => (
            <ArtifactCard
              key={artifact.id}
              artifact={artifact}
              goalTitle={goalMap.get(artifact.goal_id ?? '') ?? undefined}
              deptColor={deptColorMap.get(artifact.department_slug) ?? undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
