export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient, createSupabaseServerComponentClient } from '@/lib/supabase'
import { ActivationBadge } from '@/components/ui/ActivationBadge'
import { PulseIndicator } from '@/components/ui/PulseIndicator'
import { SyncFailedBadge } from '@/components/ui/SyncFailedBadge'
import { ActivateButton } from '@/components/departments/ActivateButton'
import { DepartmentChat } from '@/components/departments/DepartmentChat'
import { ForceResetButton } from '@/components/departments/ForceResetButton'
import { Department, EventLogEntry } from '@/types'

const ICON_MAP: Record<string, string> = {
  'briefcase': '💼', 'code': '💻', 'code-2': '💻', 'megaphone': '📣',
  'handshake': '🤝', 'bar-chart-2': '📊', 'chart': '📊', 'settings-2': '⚙️',
  'ops': '⚙️', 'shield': '🛡️', 'flask': '🧪', 'globe': '🌐',
  'users': '👥', 'zap': '⚡', 'dollar-sign': '💰',
}
const resolveIcon = (icon: string) => ICON_MAP[icon] ?? icon

interface Props { params: { slug: string } }

export default async function DepartmentDetailPage({ params }: Props) {
  const authClient = await createSupabaseServerComponentClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return notFound()

  const supabase = createServerSupabaseClient()

  const [deptResult, eventsResult] = await Promise.all([
    supabase.from('departments').select('*').eq('slug', params.slug).eq('created_by', user.id).single(),
    supabase.from('event_log').select('*').eq('department_slug', params.slug).eq('created_by', user.id)
      .order('created_at', { ascending: false }).limit(20),
  ])

  if (deptResult.error || !deptResult.data) return notFound()

  let dept = deptResult.data as Department

  // Self-healing: Ensure orc_persona_id is set to direct_llm:slug if not synced
  const targetId = dept.is_orchestrator ? 'direct_llm:orchestrator' : `direct_llm:${dept.slug}`
  if (!dept.orc_persona_id || 
      dept.orc_persona_id === 'SYNC_FAILED' || 
      dept.orc_persona_id === 'DIRECT_LLM' ||
      (dept.orc_persona_id.startsWith('direct_llm:') && dept.orc_persona_id !== targetId)) {
    
    await supabase
      .from('departments')
      .update({ orc_persona_id: targetId })
      .eq('id', dept.id)
    
    // Refresh local copy
    dept.orc_persona_id = targetId
  }

  const events = (eventsResult.data ?? []) as EventLogEntry[]
  const canActivate = dept.activation_stage !== 'active' && dept.activation_stage !== 'deprecated'
  const syncFailed = dept.orc_persona_id === 'SYNC_FAILED'

  // Stuck = running for > 30 min
  const isStuck = dept.status === 'running' && dept.last_active_at
    ? (Date.now() - new Date(dept.last_active_at).getTime()) > 30 * 60 * 1000
    : false

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 10,
            background: dept.color + '22',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}>
            {resolveIcon(dept.icon)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontFamily: 'var(--font-syne, Syne)', fontWeight: 700, fontSize: 20, color: 'var(--text)' }}>
                {dept.name}
              </h1>
              <PulseIndicator status={dept.status} showLabel />
              {dept.activation_stage === 'active' && <SyncFailedBadge personaId={dept.orc_persona_id} slug={dept.slug} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'var(--text-3)' }}>
                /{dept.slug}
              </span>
              <ActivationBadge stage={dept.activation_stage} />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isStuck && <ForceResetButton slug={dept.slug} />}
          {canActivate && <ActivateButton slug={dept.slug} stage={dept.activation_stage} />}
          <Link
            href={`/dashboard/departments/${dept.slug}/settings`}
            style={{
              fontFamily: 'var(--font-dm-mono, monospace)',
              fontSize: 11,
              padding: '7px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-3)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            ⚙ Settings
          </Link>
        </div>
      </div>

      {/* Chat */}
      <div style={{ marginBottom: 24 }}>
        <div className="crost-section-label">Task</div>
        <DepartmentChat department={dept} />
      </div>

      {/* 2-col details */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: 16 }}>
        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Persona */}
          <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
            <div className="crost-section-label">Persona</div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {dept.persona_prompt}
            </p>
          </section>

          {/* Capabilities */}
          <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
            <div className="crost-section-label">Capabilities</div>
            {(dept.capabilities as string[]).length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(dept.capabilities as string[]).map(cap => (
                  <span key={cap} style={{
                    background: 'rgba(0,212,170,0.08)',
                    color: 'var(--accent)',
                    border: '1px solid rgba(0,212,170,0.2)',
                    borderRadius: 8,
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 10,
                    padding: '3px 8px',
                  }}>
                    ✓ {cap.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No capabilities declared.</p>
            )}
            {(dept.restrictions as string[]).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {(dept.restrictions as string[]).map(r => (
                  <span key={r} style={{
                    background: 'rgba(255,77,109,0.08)',
                    color: 'var(--red)',
                    border: '1px solid rgba(255,77,109,0.2)',
                    borderRadius: 8,
                    fontFamily: 'var(--font-dm-mono, monospace)',
                    fontSize: 10,
                    padding: '3px 8px',
                  }}>
                    ✗ {r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Event log */}
          <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18 }}>
            <div className="crost-section-label">Recent Activity</div>
            {events.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>No events yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {events.map(ev => (
                  <div key={ev.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>
                      {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ color: 'var(--text-2)' }}>{ev.description}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
            <div className="crost-section-label" style={{ marginBottom: 6 }}>Model</div>
            <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'var(--accent)' }}>
              {dept.model_name}
            </p>
            <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {dept.model_provider}
            </p>
          </section>

          <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
            <div className="crost-section-label" style={{ marginBottom: 6 }}>Tools</div>
            {(dept.tools as string[]).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(dept.tools as string[]).map(t => (
                  <p key={t} style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-2)' }}>
                    {t.replace(/_/g, ' ')}
                  </p>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)' }}>
                No tools
              </p>
            )}
          </section>

          {dept.last_active_at && (
            <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
              <div className="crost-section-label" style={{ marginBottom: 4 }}>Last Active</div>
              <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-2)' }}>
                {new Date(dept.last_active_at).toLocaleDateString()}
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

