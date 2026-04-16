'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useLocalStorage } from '@/lib/hooks'
import type { Department } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
  approvalRequested?: boolean
  approvalId?: string
  error?: boolean
}

interface Props {
  department: Department
}

export function DepartmentChat({ department: dept }: Props) {
  const [messages, setMessages, messagesReady, clearMessages] = useLocalStorage<Message[]>(`crost-chat-msgs-${dept.slug}`, [])
  const [input, setInput, inputReady, clearInput] = useLocalStorage<string>(`crost-chat-input-${dept.slug}`, '')
  const [sessionId, setSessionId, sessionReady, clearSession] = useLocalStorage<string | undefined>(`crost-chat-session-${dept.slug}`, undefined)

  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (messagesReady) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, messagesReady])

  const isRunnable = dept.activation_stage === 'active' && dept.orc_persona_id !== 'SYNC_FAILED'

  const send = async () => {
    const task = input.trim()
    if (!task || loading) return

    setInput('')
    setLoading(true)
    setMessages(prev => [...prev, { role: 'user', content: task }])

    try {
      const res = await fetch(`/api/departments/${dept.slug}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task, session_id: sessionId }),
      })
      const json = await res.json()

      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: json.error ?? 'Something went wrong.', error: true }])
        return
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: json.answer,
        approvalRequested: json.approval_requested,
        approvalId: json.approval_id,
      }])

      if (json.session_id) setSessionId(json.session_id)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error — could not reach the department.', error: true }])
    } finally {
      setLoading(false)
    }
  }

  const handleClear = () => {
    if (confirm('Clear entire chat history for this department?')) {
      clearMessages()
      clearSession()
      clearInput()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  if (!isRunnable) {
    const reason = dept.activation_stage !== 'active'
      ? `Department is ${dept.activation_stage} — activate it before running tasks.`
      : 'Orc persona not synced — check your Orc connection.'

    return (
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '14px 16px',
      }}>
        <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 11, color: 'var(--text-3)' }}>
          {reason}
        </p>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 440,
    }}>
      {/* Header with Clear */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          LIVE CHAT — {dept.name.toUpperCase()}
        </span>
        {messages.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-3)',
              fontSize: 9,
              fontFamily: 'var(--font-dm-mono, monospace)',
              cursor: 'pointer',
              textDecoration: 'underline',
              opacity: 0.7
            }}
          >
            CLEAR HISTORY
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(!messagesReady) ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 11 }}>
            Restoring history...
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
            <p style={{ fontSize: 13, marginBottom: 6, color: 'var(--text-2)' }}>Ask {dept.name} anything.</p>
            <p style={{ fontFamily: 'var(--font-dm-mono, monospace)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, maxWidth: 300, margin: '0 auto' }}>
              Constitution is always prepended. Irreversible actions go to the Approval Feed.
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                background: msg.role === 'user'
                  ? 'var(--accent)'
                  : msg.error
                  ? 'rgba(255,77,109,0.1)'
                  : 'var(--bg-3)',
                color: msg.role === 'user'
                  ? '#000'
                  : msg.error
                  ? 'var(--red)'
                  : 'var(--text-2)',
                border: msg.error ? '1px solid rgba(255,77,109,0.25)' : 'none',
              }}>
                {msg.content}
                {msg.approvalRequested && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,179,71,0.3)' }}>
                    <a
                      href="/dashboard/approvals"
                      style={{
                        fontFamily: 'var(--font-dm-mono, monospace)',
                        fontSize: 10,
                        color: 'var(--amber)',
                        textDecoration: 'none',
                      }}
                    >
                      → Approval requested — review in Approval Feed
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ background: 'var(--bg-3)', borderRadius: 10, padding: '10px 14px', display: 'flex', gap: 5 }}>
              {[0, 150, 300].map(delay => (
                <span key={delay} style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--text-3)',
                  display: 'inline-block',
                  animation: `crost-bounce 1.2s ease-in-out ${delay}ms infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '10px 12px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-end',
      }}>
        <textarea
          value={inputReady ? input : ''}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Task for ${dept.name}… (Enter to send)`}
          disabled={loading || !inputReady}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            background: 'var(--bg-3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text)',
            fontFamily: 'var(--font-dm-sans, sans-serif)',
            fontSize: 12,
            padding: '8px 10px',
            outline: 'none',
            lineHeight: 1.5,
            opacity: (loading || !inputReady) ? 0.5 : 1,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim() || !inputReady}
          className="btn-primary-crost"
          style={{ padding: '8px 16px' }}
        >
          Send
        </button>
      </div>

      <style>{`
        @keyframes crost-bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
