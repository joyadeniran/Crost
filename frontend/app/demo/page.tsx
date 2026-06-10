'use client'
// /demo — Public challenge demo page
// Shows Crost's ADK multi-agent system live.

import { useState, useRef, useEffect } from 'react'

interface AgentEvent {
  type: string
  content?: string
  tool?: string
  args?: Record<string, unknown>
  result?: unknown
  agent?: string
  goalId?: string
  isFinal?: boolean
}

const DEMO_GOALS = [
  'Write a competitive analysis of our top 3 competitors and identify 2 strategic opportunities for Q3.',
  'Create a go-to-market plan for launching our new enterprise tier next month.',
  'Analyze our current sales funnel and identify the top 3 bottlenecks with specific fix recommendations.',
  'Draft a product roadmap for the next 90 days based on our company strategy.',
]

function EventBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    text: '#4ade80',
    tool_call: '#60a5fa',
    tool_result: '#a78bfa',
    agent_transfer: '#fb923c',
    final: '#34d399',
    error: '#f87171',
    goal_created: '#facc15',
    done: '#34d399',
  }
  return (
    <span style={{
      background: colors[type] ?? '#6b7280',
      color: '#000',
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: 4,
      textTransform: 'uppercase',
      fontFamily: 'monospace',
    }}>
      {type}
    </span>
  )
}

export default function DemoPage() {
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [goalId, setGoalId] = useState<string | null>(null)
  const eventsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const runDemo = async (goalText: string) => {
    if (running) return
    setRunning(true)
    setEvents([])
    setGoalId(null)

    try {
      const res = await fetch('/api/adk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ founder_input: goalText }),
      })

      if (!res.ok) {
        const err = await res.json()
        setEvents([{ type: 'error', content: err.error ?? 'Failed to start agent' }])
        return
      }

      const gid = res.headers.get('X-Goal-Id')
      if (gid) setGoalId(gid)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              setEvents(prev => [...prev, event])
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err: any) {
      setEvents(prev => [...prev, { type: 'error', content: err.message }])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#e5e7eb', fontFamily: 'Inter, sans-serif', padding: 32 }}>
      {/* Header */}
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4ade80, #3b82f6)', borderRadius: 8 }} />
          <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>Crost</span>
          <span style={{ fontSize: 12, color: '#6b7280', background: '#1f2937', padding: '2px 8px', borderRadius: 12 }}>
            Powered by Google ADK + Gemini 2.0 Flash
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          AI Company Operating System
        </h1>
        <p style={{ fontSize: 14, color: '#9ca3af', marginBottom: 32 }}>
          Multi-agent orchestration: Orc (Chief of Staff) coordinates specialist departments to execute your goals autonomously.
        </p>

        {/* Architecture badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
          {[
            { label: 'Google ADK', icon: '⚡' },
            { label: 'Gemini 2.0 Flash', icon: '🧠' },
            { label: 'Cloud Run', icon: '☁️' },
            { label: 'Cloud SQL', icon: '🗄️' },
            { label: 'MCP Protocol', icon: '🔌' },
            { label: 'Multi-Agent', icon: '🤝' },
          ].map(b => (
            <span key={b.label} style={{
              background: '#1f2937', border: '1px solid #374151',
              padding: '4px 10px', borderRadius: 20, fontSize: 12, color: '#d1d5db'
            }}>
              {b.icon} {b.label}
            </span>
          ))}
        </div>

        {/* Input */}
        <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: '#9ca3af', display: 'block', marginBottom: 8 }}>
            What should your team work on?
          </label>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g. Write a competitive analysis of our top 3 competitors..."
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 15, resize: 'none', minHeight: 80,
              fontFamily: 'Inter, sans-serif',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{input.length}/2000</span>
            <button
              onClick={() => input.trim() && runDemo(input.trim())}
              disabled={running || !input.trim()}
              style={{
                background: running ? '#374151' : 'linear-gradient(135deg, #4ade80, #3b82f6)',
                color: running ? '#6b7280' : '#000',
                border: 'none', padding: '8px 20px', borderRadius: 8,
                fontSize: 14, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {running ? '⟳ Running...' : '▶ Run Agent'}
            </button>
          </div>
        </div>

        {/* Quick examples */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Quick examples:</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DEMO_GOALS.map(g => (
              <button
                key={g}
                onClick={() => { setInput(g); runDemo(g) }}
                disabled={running}
                style={{
                  background: '#1f2937', border: '1px solid #374151', color: '#9ca3af',
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: running ? 'not-allowed' : 'pointer',
                  textAlign: 'left', maxWidth: 280,
                }}
              >
                {g.substring(0, 60)}...
              </button>
            ))}
          </div>
        </div>

        {/* Events Stream */}
        {events.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>Agent Activity Stream</h2>
              {goalId && (
                <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>
                  Goal: {goalId}
                </span>
              )}
              {running && (
                <span style={{ width: 8, height: 8, background: '#4ade80', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
              )}
            </div>

            <div style={{
              background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12,
              padding: 16, maxHeight: 500, overflowY: 'auto', fontFamily: 'monospace', fontSize: 13,
            }}>
              {events.map((event, i) => (
                <div key={i} style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <EventBadge type={event.type} />
                  <div style={{ flex: 1, color: '#cbd5e1' }}>
                    {event.type === 'text' && (
                      <span style={{ whiteSpace: 'pre-wrap' }}>{event.content}</span>
                    )}
                    {event.type === 'tool_call' && (
                      <span>
                        <span style={{ color: '#60a5fa' }}>{event.tool}</span>
                        {event.args && (
                          <span style={{ color: '#6b7280' }}> ({Object.keys(event.args).join(', ')})</span>
                        )}
                      </span>
                    )}
                    {event.type === 'tool_result' && (
                      <span>
                        <span style={{ color: '#a78bfa' }}>{event.tool}</span>
                        <span style={{ color: '#6b7280' }}> → {JSON.stringify(event.result).substring(0, 100)}...</span>
                      </span>
                    )}
                    {event.type === 'agent_transfer' && (
                      <span style={{ color: '#fb923c' }}>→ {event.agent}</span>
                    )}
                    {event.type === 'final' && (
                      <span style={{ color: '#34d399', whiteSpace: 'pre-wrap' }}>{event.content}</span>
                    )}
                    {event.type === 'error' && (
                      <span style={{ color: '#f87171' }}>{event.content}</span>
                    )}
                    {event.type === 'goal_created' && (
                      <span style={{ color: '#facc15' }}>Goal created: {event.goalId}</span>
                    )}
                    {event.type === 'done' && (
                      <span style={{ color: '#34d399' }}>✓ Agent execution complete</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={eventsEndRef} />
            </div>
          </div>
        )}

        {/* Architecture section */}
        <div style={{ marginTop: 48, borderTop: '1px solid #1f2937', paddingTop: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 16 }}>Architecture</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { title: 'Orc (Chief of Staff)', desc: 'ADK LlmAgent orchestrating all departments', icon: '🎯', color: '#4ade80' },
              { title: 'Department Agents', desc: 'Specialist LlmAgents (Marketing, Engineering, Sales)', icon: '🤝', color: '#60a5fa' },
              { title: 'ADK FunctionTools', desc: 'KB search, artifacts, approvals, memos', icon: '🔧', color: '#a78bfa' },
              { title: 'Gemini 2.0 Flash', desc: 'Primary model via Google Cloud Vertex AI', icon: '⚡', color: '#fb923c' },
              { title: 'Cloud SQL', desc: 'PostgreSQL on GCP (replaces Supabase)', icon: '🗄️', color: '#facc15' },
              { title: 'MCP Server', desc: 'Exposes Crost capabilities to external agents', icon: '🔌', color: '#34d399' },
            ].map(c => (
              <div key={c.title} style={{
                background: '#111827', border: `1px solid #1f2937`,
                borderRadius: 10, padding: 16,
              }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{c.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: c.color, marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
