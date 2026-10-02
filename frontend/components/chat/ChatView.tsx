'use client'

// The Crost home: a conversation with Orc. Replies stream in; when Orc proposes work, a plan card
// appears and one click runs it across the departments, with live progress in the thread.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { renderMarkdown } from '@/lib/chat/markdown'
import { startPolling, retryAfterMs, type PollResult } from '@/lib/polling'

type Plan = { title: string; tasks: Array<{ dept: string; label: string; deliverable: string; depends_on: number[] }> }
type Fact = { key: string; value: string; as_of: string | null; source: string | null; volatile: boolean; prohibited: boolean }
type Msg = {
  id: string
  role: 'user' | 'assistant'
  content: string
  meta?: { plan?: Plan; goal_id?: string; facts?: Fact[]; facts_saved?: boolean }
  pending?: boolean
  error?: boolean
}

const TRAILER = '\u0000'
const SUGGESTIONS = [
  'What can you do for me?',
  'Draft a launch post for our product',
  'Help me plan this week',
  'Research three competitors and compare them',
]

/** Hide a (partial) <plan> or <facts> block while streaming. */
function visible(partial: string): string {
  const i = partial.search(/<p(l(a(n>?)?)?)?$|<plan>|<f(a(c(t(s>?)?)?)?)?$|<facts>/i)
  return (i === -1 ? partial : partial.slice(0, i)).trimEnd()
}

export function ChatView({ chatId: initialChatId, greetingName }: { chatId: string | null; greetingName?: string | null }) {
  const [chatId, setChatId] = useState<string | null>(initialChatId)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(!!initialChatId)
  const [notFound, setNotFound] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!initialChatId) return
    let cancelled = false
    fetch(`/api/chats/${initialChatId}`)
      .then(async (r) => {
        if (r.status === 404) { if (!cancelled) setNotFound(true); return }
        const j = await r.json().catch(() => null)
        if (!cancelled && j?.success) setMessages(j.data.messages)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [initialChatId])

  // Scroll only the thread (scrollIntoView would also scroll the page and hide the mobile nav).
  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight }, [messages])
  useEffect(() => { inputRef.current?.focus() }, [])

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    setInput('')
    const tempId = `tmp-${Date.now()}`
    setMessages((m) => [...m,
      { id: `${tempId}-u`, role: 'user', content: message },
      { id: tempId, role: 'assistant', content: '', pending: true },
    ])
    const patch = (p: Partial<Msg>) => setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, ...p } : x)))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chatId ? { chat_id: chatId, message } : { message }),
      })
      if (res.status === 401) { window.location.href = '/login?next=/app'; return }
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null)
        patch({ pending: false, error: true, content: j?.error ?? 'Something went wrong. Please try again.' })
        return
      }
      const newId = res.headers.get('X-Chat-Id')
      if (newId && !chatId) {
        setChatId(newId)
        window.history.replaceState(null, '', `/app/c/${newId}`)
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let raw = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        raw += dec.decode(value, { stream: true })
        const cut = raw.indexOf(TRAILER)
        patch({ content: visible(cut === -1 ? raw : raw.slice(0, cut)) })
      }
      const cut = raw.indexOf(TRAILER)
      const trailer = cut === -1 ? null : JSON.parse(raw.slice(cut + 1) || 'null')
      if (!trailer || trailer.error) {
        patch({ pending: false, error: true, content: trailer?.error ?? 'The reply was interrupted. Please try again.' })
      } else {
        const text = visible(raw.slice(0, cut))
        setMessages((m) => m.map((x) => (x.id === tempId
          ? { id: trailer.message_id, role: 'assistant', content: text, meta: {
              ...(trailer.plan ? { plan: trailer.plan } : {}),
              ...(trailer.facts?.length ? { facts: trailer.facts } : {}),
            } }
          : x)))
      }
      window.dispatchEvent(new Event('crost:chats-changed'))
    } catch {
      patch({ pending: false, error: true, content: 'Network error. Please try again.' })
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }, [busy, chatId])

  const empty = !loading && messages.length === 0

  if (notFound) {
    return (
      <div className="chat-wrap">
        <div className="chat-empty">
          <h1 className="chat-hello">This chat doesn&apos;t exist.</h1>
          <Link className="pill-btn" href="/app">Start a new chat</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`chat-wrap${empty ? ' is-empty' : ''}`}>
      <div className="chat-scroll" ref={scrollRef}>
        {empty ? (
          <div className="chat-empty">
            <div className="eyebrow">Orc · your chief of staff</div>
            <h1 className="chat-hello">
              {greetingName ? <>What can I help with, <em>{greetingName}</em>?</> : <>What can I <em>help</em> with?</>}
            </h1>
            <p className="chat-sub">Ask anything, or hand me a goal. Marketing, Engineering, Sales and Operations are ready, and nothing goes out without your approval.</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="pill-btn ghost" onClick={() => send(s)} disabled={busy}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-thread">
            {messages.map((m) => (
              <MessageRow key={m.id} msg={m} chatId={chatId} onRetry={() => {
                const lastUser = [...messages].reverse().find((x) => x.role === 'user')
                if (lastUser) send(lastUser.content)
              }} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <form
        className="composer"
        onSubmit={(e) => { e.preventDefault(); send(input) }}
      >
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          placeholder="Message Orc…"
          onChange={(e) => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input) }
          }}
        />
        <button type="submit" className="send-btn" disabled={busy || !input.trim()} aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
        </button>
      </form>
      <div className="composer-note">Orc can make mistakes. External actions always wait for your approval.</div>
    </div>
  )
}

function MessageRow({ msg, chatId, onRetry }: { msg: Msg; chatId: string | null; onRetry: () => void }) {
  if (msg.role === 'user') {
    return <div className="msg-user"><div className="bubble">{msg.content}</div></div>
  }
  return (
    <div className="msg-orc">
      <div className="msg-who">Orc</div>
      {msg.pending && !msg.content ? (
        <div className="typing"><span /><span /><span /></div>
      ) : (
        <div className={`msg-body${msg.error ? ' is-error' : ''}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
      )}
      {msg.error && <button className="link-btn" onClick={onRetry}>Try again</button>}
      {msg.meta?.plan && chatId && !msg.id.startsWith('tmp-') && (
        msg.meta.goal_id
          ? <MissionCard goalId={msg.meta.goal_id} title={msg.meta.plan.title} />
          : <PlanCard plan={msg.meta.plan} chatId={chatId} messageId={msg.id} />
      )}
      {msg.meta?.facts?.length && chatId && !msg.id.startsWith('tmp-') ? (
        <FactsCard facts={msg.meta.facts} saved={!!msg.meta.facts_saved} chatId={chatId} messageId={msg.id} />
      ) : null}
    </div>
  )
}

const DEPT_LABEL: Record<string, string> = { marketing: 'Marketing', engineering: 'Engineering', sales: 'Sales', operations: 'Operations' }

function PlanCard({ plan, chatId, messageId }: { plan: Plan; chatId: string; messageId: string }) {
  const [goalId, setGoalId] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'starting' | 'error'>('idle')

  if (goalId) return <MissionCard goalId={goalId} title={plan.title} />

  const run = async () => {
    setState('starting')
    try {
      const r = await fetch(`/api/chats/${chatId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId }),
      })
      const j = await r.json().catch(() => null)
      if (j?.success && j.data?.goal_id) setGoalId(j.data.goal_id)
      else setState('error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="card plan-card">
      <div className="eyebrow">Proposed plan</div>
      <div className="card-title">{plan.title}</div>
      <ol className="plan-steps">
        {plan.tasks.map((t, i) => (
          <li key={i}>
            <span className="dept-tag">{DEPT_LABEL[t.dept] ?? t.dept}</span>
            <span className="step-label">{t.label}</span>
            {t.deliverable && <span className="step-out">→ {t.deliverable}</span>}
          </li>
        ))}
      </ol>
      <div className="card-actions">
        <button className="pill-btn solid" onClick={run} disabled={state === 'starting'}>
          {state === 'starting' ? 'Starting…' : 'Run this plan'}
        </button>
        <span className="card-hint">{state === 'error' ? 'Could not start — try again.' : 'Or reply to change it.'}</span>
      </div>
    </div>
  )
}

/** Facts Orc offers to remember. Nothing is saved until the founder clicks. */
function FactsCard({ facts, saved, chatId, messageId }: { facts: Fact[]; saved: boolean; chatId: string; messageId: string }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'dismissed' | 'error'>(saved ? 'saved' : 'idle')
  if (state === 'dismissed') return null

  const save = async () => {
    setState('saving')
    try {
      const r = await fetch('/api/facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts, chat_id: chatId, message_id: messageId }),
      })
      const j = await r.json().catch(() => null)
      setState(j?.success ? 'saved' : 'error')
    } catch {
      setState('error')
    }
  }

  return (
    <div className="card plan-card">
      <div className="eyebrow">{state === 'saved' ? 'Saved to company facts' : 'Remember this?'}</div>
      <ul className="plan-steps">
        {facts.map((f) => (
          <li key={f.key}>
            <span className="dept-tag">{f.prohibited ? 'Never claim' : f.key.replace(/_/g, ' ')}</span>
            <span className="step-label">{f.value}</span>
            {f.as_of && <span className="step-out">as of {f.as_of}</span>}
          </li>
        ))}
      </ul>
      {state !== 'saved' && (
        <div className="card-actions">
          <button className="pill-btn solid" onClick={save} disabled={state === 'saving'}>
            {state === 'saving' ? 'Saving…' : 'Save to company facts'}
          </button>
          <button className="link-btn" onClick={() => setState('dismissed')}>Not now</button>
          <span className="card-hint">{state === 'error' ? 'Could not save — try again.' : 'Orc and the departments use only saved facts for figures.'}</span>
        </div>
      )}
    </div>
  )
}

type Progress = {
  status: string
  tasks: Array<{ task_id: string; label: string; dept_slug: string; status: string; question?: string | null }>
  approvals_pending: number
  artifacts: number
}

const DONE = new Set(['completed', 'failed', 'cancelled', 'error'])
const TASK_TEXT: Record<string, string> = {
  planned: 'Queued', pending: 'Queued', pending_dependency: 'Waiting on a step', approved: 'Queued',
  dispatched: 'Working', running: 'Working', completed: 'Done', failed: 'Failed', failed_permanent: 'Failed',
  rejected: 'Rejected', skipped: 'Skipped', expired: 'Expired', needs_data: 'Needs your input',
}

function MissionCard({ goalId, title }: { goalId: string; title: string }) {
  const [p, setP] = useState<Progress | null>(null)
  const [restart, setRestart] = useState(0) // bump to resume fast polling after the founder answers

  useEffect(() => {
    return startPolling(async (): Promise<PollResult> => {
      const r = await fetch(`/api/goals/${goalId}/status`)
      if (r.status === 404 || r.status === 401) return 'stop'
      if (r.status === 429) return { retryAfterMs: retryAfterMs(r.headers.get('Retry-After')) ?? 60000 }
      const j = await r.json().catch(() => null)
      if (!j?.success) return 'unchanged'
      setP((prev) => (prev && JSON.stringify(prev) === JSON.stringify(j.data) ? prev : j.data))
      return DONE.has(j.data.status) ? 'stop' : 'changed'
    }, { baseMs: 3000, maxMs: 15000, immediate: true })
  }, [goalId, restart])

  const finished = p && DONE.has(p.status)
  const doneCount = p?.tasks.filter((t) => t.status === 'completed').length ?? 0

  return (
    <div className="card mission-card">
      <div className="eyebrow">{finished ? (p!.status === 'completed' ? 'Mission complete' : 'Mission stopped') : 'Mission running'}</div>
      <div className="card-title">{title}</div>
      {p ? (
        <ul className="mission-steps">
          {p.tasks.map((t) => (
            <li key={t.task_id} className={`st-${t.status}`}>
              <span className="dot" />
              <span className="dept-tag">{DEPT_LABEL[t.dept_slug] ?? t.dept_slug}</span>
              <span className="step-label">{t.label}</span>
              <span className="step-state">{TASK_TEXT[t.status] ?? t.status}</span>
              {t.status === 'needs_data' && (
                <StepQuestion goalId={goalId} taskId={t.task_id} question={t.question} onResumed={() => {
                  setP((prev) => prev && { ...prev, tasks: prev.tasks.map((x) => (x.task_id === t.task_id ? { ...x, status: 'planned', question: null } : x)) })
                  setRestart((n) => n + 1)
                }} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="typing"><span /><span /><span /></div>
      )}
      <div className="card-actions">
        {p && p.approvals_pending > 0 && (
          <Link className="pill-btn solid" href="/app/notifications">Review {p.approvals_pending} approval{p.approvals_pending > 1 ? 's' : ''}</Link>
        )}
        {p && p.artifacts > 0 && (
          <Link className="pill-btn" href={`/app/artifacts?goal=${goalId}`}>Open {p.artifacts} deliverable{p.artifacts > 1 ? 's' : ''}</Link>
        )}
        {p && <span className="card-hint">{doneCount}/{p.tasks.length} steps done</span>}
      </div>
    </div>
  )
}

/** A department is blocked on something only the founder knows: answer it, let them assume, or skip. */
function StepQuestion({ goalId, taskId, question, onResumed }: {
  goalId: string; taskId: string; question?: string | null; onResumed: () => void
}) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (body: Record<string, unknown>, url = `/api/goals/${goalId}/tasks/${taskId}/answer`, method = 'POST') => {
    setBusy(true); setErr(null)
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error()
      onResumed()
    } catch {
      setErr('Could not send that — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="step-question">
      <div className="step-q-text">{question || 'This step needs a bit more information from you.'}</div>
      <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) submit({ answer }) }} className="step-q-form">
        <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer…" disabled={busy} />
        <button className="pill-btn solid" disabled={busy || !answer.trim()}>Send</button>
      </form>
      <div className="step-q-alt">
        <button className="link-btn" disabled={busy} onClick={() => submit({ assume: true })}>Use your best assumptions</button>
        <button className="link-btn" disabled={busy} onClick={() => submit({ status: 'skipped' }, `/api/goals/${goalId}/tasks/${taskId}`, 'PATCH')}>Skip this step</button>
        {err && <span className="card-hint">{err}</span>}
      </div>
    </div>
  )
}
