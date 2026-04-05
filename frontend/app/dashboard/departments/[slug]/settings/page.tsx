export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase'
import { DeptSettingsForm } from '@/components/departments/DeptSettingsForm'
import { ActivationBadge } from '@/components/ui/ActivationBadge'
import type { Department } from '@/types'

interface Props { params: { slug: string } }

export default async function DepartmentSettingsPage({ params }: Props) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('slug', params.slug)
    .single()

  if (error || !data) return notFound()
  const dept = data as Department

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, fontSize: 12, color: 'var(--text-3)' }}>
        <Link href="/dashboard" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>Dashboard</Link>
        <span>/</span>
        <Link href={`/dashboard/departments/${dept.slug}`} style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
          {dept.name}
        </Link>
        <span>/</span>
        <span style={{ color: 'var(--text-2)' }}>Settings</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>
              {dept.name} — Settings
            </h1>
            <ActivationBadge stage={dept.activation_stage} />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Changes to persona or tools will reset the department to review stage.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24 }}>
        {[
          { label: 'Overview', href: `/dashboard/departments/${dept.slug}` },
          { label: 'Settings', href: `/dashboard/departments/${dept.slug}/settings`, active: true },
        ].map(tab => (
          <Link
            key={tab.label}
            href={tab.href}
            style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 11,
              padding: '6px 14px',
              borderRadius: 8,
              background: tab.active ? 'var(--accent-dim)' : 'transparent',
              color: tab.active ? 'var(--accent)' : 'var(--text-3)',
              border: tab.active ? '1px solid rgba(0,212,170,0.2)' : '1px solid transparent',
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <DeptSettingsForm dept={dept} />
    </div>
  )
}
