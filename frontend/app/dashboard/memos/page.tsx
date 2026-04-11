export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase'
import { MemoCard } from '@/components/memos/MemoCard'
import { CompanyMemo } from '@/types'

export default async function MemosPage() {
  const supabase = createServerSupabaseClient()
  const { data } = await supabase
    .from('company_memos')
    .select('*')
    .neq('from_department', 'founder') // Exclude raw clarification dialogue responses — not real memos
    .order('created_at', { ascending: false })
    .limit(50)

  const memos = (data ?? []) as CompanyMemo[]
  const urgent = memos.filter(m => m.priority === 'urgent' || m.priority === 'high')
  const normal = memos.filter(m => m.priority === 'normal' || m.priority === 'low')

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 20, color: 'var(--text)', marginBottom: 2 }}>
          Company Memos
        </h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Cross-department knowledge sharing</p>
      </div>

      {urgent.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <div className="crost-section-label">Urgent / High Priority</div>
          {urgent.map(memo => <MemoCard key={memo.id} memo={memo} />)}
        </section>
      )}

      {normal.length > 0 && (
        <section>
          <div className="crost-section-label">All Memos</div>
          {normal.map(memo => <MemoCard key={memo.id} memo={memo} />)}
        </section>
      )}

      {memos.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-dm-mono, monospace)',
          fontSize: 12,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
          No memos yet
        </div>
      )}
    </div>
  )
}
