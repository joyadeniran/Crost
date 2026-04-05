'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const TOTAL_STEPS = 6

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 2 — identity
  const [identity, setIdentity] = useState('')
  // Step 3 — location / building context
  const [location, setLocation] = useState('')
  const [industry, setIndustry] = useState('')
  const [stage, setStage] = useState<string>('')
  // Step 4 — target user / ICP
  const [targetUser, setTargetUser] = useState('')
  const [problem, setProblem] = useState('')
  // Step 5 — mode
  const [mode, setMode] = useState<'local' | 'cloud'>('local')
  const [saving, setSaving] = useState(false)

  const next = () => setStep(s => Math.min(s + 1, TOTAL_STEPS))
  const back = () => setStep(s => Math.max(s - 1, 1))

  const finish = async () => {
    setSaving(true)
    try {
      // Compose a rich identity string from all collected context
      const parts = [identity.trim()]
      if (location.trim()) parts.push(`Based in ${location.trim()}`)
      if (industry.trim()) parts.push(`Industry: ${industry.trim()}`)
      if (stage) parts.push(`Stage: ${stage}`)
      if (targetUser.trim()) parts.push(`Customer: ${targetUser.trim()}`)
      if (problem.trim()) parts.push(`Solving: ${problem.trim()}`)
      const richIdentity = parts.join(' · ')

      await Promise.all([
        fetch('/api/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        }),
        fetch('/api/config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'local_identity', value: richIdentity }),
        }),
      ])
      router.push('/dashboard')
    } finally {
      setSaving(false)
    }
  }

  // Shared styles
  const inputClass: React.CSSProperties = {
    width: '100%',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    padding: '12px 16px',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: 'DM Mono, monospace',
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#09090b',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 40 }}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div key={i} style={{
              height: 3,
              flex: 1,
              borderRadius: 2,
              background: i < step ? '#00d4aa' : 'rgba(255,255,255,0.08)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 52, marginBottom: 20 }}>⚡</div>
            <h1 style={{ fontFamily: 'Syne, sans-serif', fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 12 }}>
              Welcome to Crost
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 32 }}>
              Your Agentic Operating System. A team of AI departments — Marketing, Engineering, Sales, Finance — working for you under one Constitution.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'left', marginBottom: 8 }}>
              {[['💼', 'Sales', 'Prospecting & outreach'], ['💻', 'Engineering', 'Code & technical tasks'], ['📣', 'Marketing', 'Content & campaigns'], ['📊', 'Finance', 'Budgets & reporting']].map(([icon, name, desc]) => (
                <div key={name} style={{
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.07)',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '12px 14px',
                }}>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 2 }}>{name}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Identity */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              What's your company called?
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 28, lineHeight: 1.6 }}>
              This is shown in the sidebar and used by your AI departments as context.
            </p>
            <label style={labelStyle}>Company / Project name</label>
            <input
              type="text"
              value={identity}
              onChange={e => setIdentity(e.target.value)}
              placeholder="e.g. Crost, Supplya, TaskFlow"
              style={inputClass}
              autoFocus
            />
          </div>
        )}

        {/* Step 3: Where are you building? */}
        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              Where are you building?
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 28, lineHeight: 1.6 }}>
              Context that helps your AI departments stay localised and relevant.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Location / Market</label>
                <input
                  type="text"
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. London, UK · US-remote · Lagos, Nigeria"
                  style={inputClass}
                />
              </div>
              <div>
                <label style={labelStyle}>Industry / Sector</label>
                <input
                  type="text"
                  value={industry}
                  onChange={e => setIndustry(e.target.value)}
                  placeholder="e.g. B2B SaaS, Fintech, E-commerce, Creator tools"
                  style={inputClass}
                />
              </div>
              <div>
                <label style={labelStyle}>Stage</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['Idea', 'Pre-revenue', 'Early revenue', 'Growth', 'Scale'].map(s => (
                    <button
                      key={s}
                      onClick={() => setStage(stage === s ? '' : s)}
                      style={{
                        fontFamily: 'DM Mono, monospace',
                        fontSize: 11,
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: stage === s ? '1px solid #00d4aa' : '1px solid rgba(255,255,255,0.1)',
                        background: stage === s ? 'rgba(0,212,170,0.1)' : 'rgba(255,255,255,0.04)',
                        color: stage === s ? '#00d4aa' : 'rgba(255,255,255,0.5)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Who is your user? */}
        {step === 4 && (
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              Who is your customer?
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 28, lineHeight: 1.6 }}>
              Your AI departments will tailor all output — emails, content, code — to your real ICP.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStyle}>Target customer / ICP</label>
                <input
                  type="text"
                  value={targetUser}
                  onChange={e => setTargetUser(e.target.value)}
                  placeholder="e.g. Solo founders, SMB ops teams, DTC brand owners"
                  style={inputClass}
                  autoFocus
                />
              </div>
              <div>
                <label style={labelStyle}>Core problem you&apos;re solving</label>
                <textarea
                  value={problem}
                  onChange={e => setProblem(e.target.value)}
                  placeholder="e.g. Founders spend too much time on operations instead of building product"
                  rows={3}
                  style={{ ...inputClass, resize: 'none', lineHeight: 1.6 }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Mode */}
        {step === 5 && (
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              Choose your AI mode
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 28, lineHeight: 1.6 }}>
              You can switch this anytime in Settings.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {([
                {
                  mode: 'local' as const,
                  icon: '🖥',
                  title: 'Local AI',
                  desc: 'Runs on your machine via Ollama (gemma3:4b). Private, free, no data leaves your device.',
                  note: 'Requires Ollama installed',
                },
                {
                  mode: 'cloud' as const,
                  icon: '☁️',
                  title: 'Cloud AI',
                  desc: 'Routes through LiteLLM to Gemini, Claude, or Groq. Faster and more capable.',
                  note: 'Requires API keys configured',
                },
              ] as const).map(opt => (
                <button
                  key={opt.mode}
                  onClick={() => setMode(opt.mode)}
                  style={{
                    borderRadius: 12,
                    border: mode === opt.mode ? '1px solid #00d4aa' : '1px solid rgba(255,255,255,0.08)',
                    background: mode === opt.mode ? 'rgba(0,212,170,0.06)' : 'rgba(255,255,255,0.03)',
                    padding: '16px 18px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>{opt.icon}</span>
                    <span style={{ fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 700, color: mode === opt.mode ? '#00d4aa' : '#fff' }}>
                      {opt.title}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, marginBottom: 6 }}>{opt.desc}</p>
                  <span style={{
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 10,
                    color: mode === opt.mode ? 'rgba(0,212,170,0.7)' : 'rgba(255,255,255,0.25)',
                  }}>
                    {opt.note}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 6: Constitution */}
        {step === 6 && (
          <div>
            <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
              The Agent Constitution
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.6 }}>
              Every department follows these 8 rules — always, without exception. You can add custom clauses in Settings.
            </p>
            <div style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              padding: '16px 18px',
              maxHeight: 260,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {[
                'NEVER take an irreversible action without explicit founder approval.',
                'NEVER fabricate data, metrics, quotes, or facts.',
                'NEVER expose credentials, API keys, personal data, or financial figures.',
                'NEVER make commitments on behalf of the founder without explicit approval.',
                'ALWAYS check company_memos before starting a task that could conflict with another department.',
                'ALWAYS surface uncertainty — ask a clarifying question before acting on ambiguous tasks.',
                'ALWAYS write to the event_log when starting, completing, or failing a task.',
                'You are a department head, not an autonomous agent. The founder is the CEO.',
              ].map((rule, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    fontFamily: 'DM Mono, monospace',
                    fontSize: 11,
                    color: '#00d4aa',
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>{rule}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 36 }}>
          {step > 1 ? (
            <button
              onClick={back}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                fontSize: 13,
                cursor: 'pointer',
                padding: '8px 0',
              }}
            >
              ← Back
            </button>
          ) : <span />}

          {step < TOTAL_STEPS ? (
            <button
              onClick={next}
              style={{
                borderRadius: 10,
                background: '#00d4aa',
                color: '#000',
                fontFamily: 'DM Mono, monospace',
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 24px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Continue →
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={saving}
              style={{
                borderRadius: 10,
                background: saving ? 'rgba(0,212,170,0.4)' : '#00d4aa',
                color: '#000',
                fontFamily: 'DM Mono, monospace',
                fontSize: 13,
                fontWeight: 600,
                padding: '10px 24px',
                border: 'none',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Setting up…' : 'Launch Crost →'}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
