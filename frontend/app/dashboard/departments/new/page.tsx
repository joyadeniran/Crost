'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreateDepartmentWizard } from '@/components/departments/CreateDepartmentWizard'
import type { Department } from '@/types'

export default function NewDepartmentPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'templates' | 'custom'>('templates')
  const [templates, setTemplates] = useState<Department[]>([])
  const [ownedDepartments, setOwnedDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [submittingSlug, setSubmittingSlug] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadDepartments() {
      try {
        const [templatesRes, ownedRes] = await Promise.all([
          fetch('/api/departments?scope=templates&active_only=true'),
          fetch('/api/departments?scope=user'),
        ])

        const [templatesJson, ownedJson] = await Promise.all([templatesRes.json(), ownedRes.json()])
        setTemplates((templatesJson.data ?? []) as Department[])
        setOwnedDepartments((ownedJson.data ?? []) as Department[])
      } catch (err) {
        console.error('Failed to load department templates', err)
        setError('Unable to load department templates right now.')
      } finally {
        setLoading(false)
      }
    }

    loadDepartments()
  }, [])

  const ownedSlugs = useMemo(() => new Set(ownedDepartments.map((dept) => dept.slug)), [ownedDepartments])
  const availableTemplates = templates.filter((dept) => !dept.is_orchestrator && !ownedSlugs.has(dept.slug))

  async function handleUseTemplate(templateSlug: string) {
    setSubmittingSlug(templateSlug)
    setError(null)

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_slug: templateSlug }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error ?? 'Failed to create department from template.')
      }
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department from template.')
    } finally {
      setSubmittingSlug(null)
    }
  }

  if (mode === 'custom') {
    return (
      <div>
        <CreateDepartmentWizard onClose={() => router.push('/dashboard')} />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 24, color: 'var(--text)', marginBottom: 6 }}>
            New Department
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 720, lineHeight: 1.6 }}>
            Start from an existing department template so new departments stay consistent with Crost. You can customize any cloned department later in its settings.
          </p>
        </div>
        <button
          onClick={() => setMode('custom')}
          style={{
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-2)',
            fontFamily: 'var(--font-dm-mono, monospace)',
            fontSize: 11,
            padding: '8px 12px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Create From Scratch
        </button>
      </div>

      {error && (
        <div style={{
          marginBottom: 16,
          borderRadius: 8,
          border: '1px solid rgba(239, 68, 68, 0.2)',
          background: 'rgba(239, 68, 68, 0.08)',
          color: 'var(--red)',
          padding: '12px 14px',
          fontSize: 12,
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '40px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 12,
        }}>
          Loading department templates...
        </div>
      ) : availableTemplates.length === 0 ? (
        <div style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '32px',
        }}>
          <div style={{ fontFamily: 'var(--font-syne, Syne)', fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>
            No unused templates available
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 16 }}>
            You already have every active department template in this workspace. If you need a brand-new department shape, create one from scratch.
          </p>
          <button className="btn-primary-crost" onClick={() => setMode('custom')}>
            Open Custom Wizard
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {availableTemplates.map((template) => (
            <div
              key={template.id}
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: `${template.color}20`,
                    color: template.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    border: `1px solid ${template.color}30`,
                  }}
                >
                  {template.icon}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-syne, Syne)', fontSize: 17, color: 'var(--text)' }}>
                    {template.name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)' }}>
                    /{template.slug}
                  </div>
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, minHeight: 58 }}>
                {template.persona_prompt.split('. ')[0]?.trim() || `${template.name} department template.`}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(template.capabilities ?? []).slice(0, 3).map((capability) => (
                  <span
                    key={capability}
                    style={{
                      fontFamily: 'var(--font-dm-mono, monospace)',
                      fontSize: 9,
                      color: 'var(--accent)',
                      background: 'rgba(0,212,170,0.08)',
                      border: '1px solid rgba(0,212,170,0.2)',
                      borderRadius: 999,
                      padding: '4px 8px',
                    }}
                  >
                    {capability.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <button
                className="btn-primary-crost"
                onClick={() => handleUseTemplate(template.slug)}
                disabled={submittingSlug === template.slug}
              >
                {submittingSlug === template.slug ? 'Adding...' : 'Use Template'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
