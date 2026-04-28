export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ArtifactsGrid } from '@/components/artifacts/ArtifactsGrid'
import { Artifact } from '@/types'

export default async function ArtifactsPage() {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createServerSupabaseClient()

  // Fetch artifacts + goals + departments in parallel
  const [{ data: artifactsData }, { data: goalsData }, { data: deptsData }] = await Promise.all([
    supabase
      .from('artifacts')
      .select('*')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('goals')
      .select('id, title')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('departments')
      .select('slug, color')
      .eq('created_by', user.id)
      .eq('activation_stage', 'active'),
  ])

  const artifacts = (artifactsData ?? []).filter((a: any) =>
    !a.body?.startsWith('[TOOL EXECUTION FAILED') &&
    !a.title?.startsWith('[TOOL EXECUTION FAILED')
  ) as Artifact[]

  const goalMap = new Map((goalsData ?? []).map((g: any) => [g.id, g.title]))
  const deptColorMap = new Map((deptsData ?? []).map((d: any) => [d.slug, d.color]))

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontFamily: 'var(--font-syne, Syne)',
          fontWeight: 700,
          fontSize: 24,
          color: 'var(--text)',
          marginBottom: 4,
          letterSpacing: '-0.02em',
        }}>
          Company Artifacts
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
          {artifacts.length > 0
            ? `Browse, filter, and download your company's technical deliverables.`
            : 'Your generated files will appear here'
          }
        </p>
      </div>

      {artifacts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '100px 20px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 13,
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 16,
          border: '1px dashed rgba(255,255,255,0.08)',
        }}>
          <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24"
            style={{ margin: '0 auto 16px', opacity: 0.3 }}>
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <div style={{ marginBottom: 8 }}>No artifacts generated yet.</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>
            Approve tasks to see your departments create work files here.
          </div>
        </div>
      ) : (
        <ArtifactsGrid 
          initialArtifacts={artifacts}
          goalMap={goalMap}
          deptColorMap={deptColorMap}
        />
      )}
    </div>
  )
}
