export const dynamic = 'force-dynamic'

import { ARTIFACT_LIST_COLUMNS } from '@/lib/egress-columns'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ArtifactsGrid } from '@/components/artifacts/ArtifactsGrid'
import { Artifact } from '@/types'

export default async function ArtifactsPage({ searchParams }: { searchParams?: { goal?: string } }) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createServerSupabaseClient()

  // Fetch artifacts + goals + departments in parallel.
  // Fetch all non-discarded artifacts (drafts included — they show inline with a Draft badge).
  // ?goal=<id> (from a chat mission card) narrows the list to that mission's deliverables.
  const goalFilter = searchParams?.goal && /^[0-9a-f-]{36}$/i.test(searchParams.goal) ? searchParams.goal : null
  let artifactsQuery = supabase
    .from('artifacts')
    .select(ARTIFACT_LIST_COLUMNS)
    .eq('created_by', user.id)
    .not('status', 'eq', 'discarded')
  if (goalFilter) artifactsQuery = artifactsQuery.eq('goal_id', goalFilter)

  const [{ data: artifactsData }, { data: goalsData }, { data: deptsData }] = await Promise.all([
    artifactsQuery
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

  const goalMap = new Map<string, string>((goalsData ?? []).map((g: any) => [g.id, g.title]))
  const deptColorMap = new Map<string, string>((deptsData ?? []).map((d: any) => [d.slug, d.color]))

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
          Deliverables
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'Inter, sans-serif' }}>
          {artifacts.length > 0
            ? 'Everything your departments have produced. Open, approve or download any of it.'
            : 'Run a plan from the chat and what your departments produce shows up here.'
          }
        </p>
      </div>

      {artifacts.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '100px 20px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: 13,
          background: 'rgba(28,25,23,0.02)',
          borderRadius: 16,
          border: '1px dashed rgba(28,25,23,0.08)',
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
