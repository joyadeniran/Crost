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
// One list of deliverables. Drafts show inline (with a Draft badge on the card) — no separate sandbox.
const VISIBLE_STATUSES = new Set(['draft', 'review', 'active', 'paused', 'deprecated'])

export function ArtifactsGrid({ initialArtifacts, goalMap, deptColorMap }: Props) {
  const [searchTerm, setSearchTerm] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  const filteredArtifacts = useMemo(() => {
    return initialArtifacts.filter(artifact => {
      const matchesView = VISIBLE_STATUSES.has(artifact.status ?? 'review')
      const matchesSearch = artifact.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (goalMap.get(artifact.goal_id ?? '') ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      const matchesFilter = activeFilter === 'all' || artifact.artifact_type === activeFilter
      return matchesView && matchesSearch && matchesFilter
    })
  }, [initialArtifacts, searchTerm, activeFilter, goalMap])

  // Only offer filters for types that actually exist in the list (most founders
  // only ever have documents and spreadsheets — eight empty chips was noise).
  const ALL_FILTERS: { label: string, value: FilterType }[] = [
    { label: 'Documents', value: 'document' },
    { label: 'Spreadsheets', value: 'spreadsheet' },
    { label: 'Presentations', value: 'presentation' },
    { label: 'PDFs', value: 'pdf' },
    { label: 'Images', value: 'image' },
    { label: 'Data', value: 'data' },
    { label: 'Code', value: 'code' },
  ]
  const presentTypes = new Set(initialArtifacts.map(a => a.artifact_type))
  const typeFilters = ALL_FILTERS.filter(f => presentTypes.has(f.value as Artifact['artifact_type']))
  const filterOptions = typeFilters.length > 1 ? [{ label: 'All', value: 'all' as FilterType }, ...typeFilters] : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Search and Filters */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <input
            type="text"
            placeholder="Search deliverables"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              fontSize: 14,
              color: 'var(--text)',
              outline: 'none'
            }}
          />
        </div>

        {filterOptions.length > 0 && (<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {filterOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setActiveFilter(opt.value)}
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'var(--font-dm-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                background: activeFilter === opt.value ? 'var(--accent)' : 'var(--bg-3)',
                color: activeFilter === opt.value ? '#fff' : 'var(--text-3)',
                border: activeFilter === opt.value ? '1px solid var(--accent)' : '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>)}
      </div>

      {/* Grid */}
      {filteredArtifacts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 13,
          background: 'rgba(28,25,23,0.01)',
          borderRadius: 16,
          border: '1px dashed rgba(28,25,23,0.05)',
        }}>
          No deliverables match that search.
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))',
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
