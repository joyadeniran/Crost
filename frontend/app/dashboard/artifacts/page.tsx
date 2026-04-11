export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { ArtifactCard } from '@/components/artifacts/ArtifactCard'
import { Artifact } from '@/types'

export default async function ArtifactsPage() {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('artifacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  // Filter out failed tool execution errors that were accidentally stored as artifacts
  const artifacts = (data ?? []).filter((a: any) =>
    !a.body?.startsWith('[TOOL EXECUTION FAILED') &&
    !a.title?.startsWith('[TOOL EXECUTION FAILED')
  ) as Artifact[]
  const images = artifacts.filter(a => a.artifact_type === 'image')
  const docs = artifacts.filter(a => a.artifact_type === 'document')
  const dataResults = artifacts.filter(a => a.artifact_type !== 'image' && a.artifact_type !== 'document')

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 24, color: 'var(--text)', marginBottom: 2, letterSpacing: '-0.02em' }}>
          Company Artifacts
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
          Permanent work outputs, files, and graphic designs.
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
          borderRadius: 12,
          border: '1px dashed rgba(255,255,255,0.1)'
        }}>
          <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.5 }}>🏗️</div>
          <div>No artifacts generated yet.</div>
          <div style={{ fontSize: 11, marginTop: 8, opacity: 0.7 }}>
            Approve tasks to see your departments create work files.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {artifacts.map(artifact => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </div>
      )}
    </div>
  )
}
