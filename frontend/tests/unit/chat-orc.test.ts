/**
 * Chat-first Orc: prompt, plan protocol, streaming fallback, markdown safety, plan → mission mapping.
 */
import { describe, it, expect, vi } from 'vitest'
import { buildOrcSystemPrompt, extractPlan, validatePlan, visibleText, streamOrcReply } from '@/lib/chat/orc'
import { renderMarkdown } from '@/lib/chat/markdown'

vi.mock('@/lib/supabase', () => ({ createServerSupabaseClient: vi.fn() }))
vi.mock('@/lib/background', () => ({ triggerDispatch: vi.fn() }))
vi.mock('@/lib/engine/model', () => ({ getModel: vi.fn(async () => ({ model: 'gemini/x' })) }))

describe('buildOrcSystemPrompt', () => {
  it('names the company, the founder and all four departments', () => {
    const p = buildOrcSystemPrompt({ companyName: 'Acme', founderName: 'Joy', industry: 'Fintech' }, new Date('2026-10-02'))
    expect(p).toContain('chief of staff at Acme')
    expect(p).toContain('working for Joy')
    expect(p).toContain('Industry: Fintech')
    for (const d of ['marketing', 'engineering', 'sales', 'operations']) expect(p).toContain(`- ${d}:`)
    expect(p).toContain('2026-10-02')
  })

  it('keeps the approval rule and the chat-first rule', () => {
    const p = buildOrcSystemPrompt({})
    expect(p).toMatch(/never claim you sent, posted, paid or booked/i)
    expect(p).toMatch(/Most messages need no departments/)
  })
})

describe('plan protocol', () => {
  const block = '<plan>{"title":"Launch week","tasks":[{"dept":"marketing","label":"Write launch post","deliverable":"Post draft","depends_on":[]},{"dept":"sales","label":"Outreach list","deliverable":"20 leads","depends_on":[1]}]}</plan>'

  it('returns plain replies untouched', () => {
    expect(extractPlan('Hi! I can help with that.')).toEqual({ reply: 'Hi! I can help with that.', plan: null })
  })

  it('splits the reply from a valid plan', () => {
    const { reply, plan } = extractPlan(`I'll have the team do this.\n${block}`)
    expect(reply).toBe("I'll have the team do this.")
    expect(plan?.title).toBe('Launch week')
    expect(plan?.tasks).toHaveLength(2)
    expect(plan?.tasks[1].depends_on).toEqual([1])
  })

  it('drops unknown departments, forward dependencies and caps at 5 tasks', () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({ dept: i === 0 ? 'legal' : 'operations', label: `t${i}`, depends_on: [i + 1, 1] }))
    const plan = validatePlan(JSON.stringify({ title: 'x', tasks }))
    expect(plan?.tasks.map((t) => t.label)).toEqual(['t1', 't2', 't3', 't4'])
    expect(plan?.tasks[0].depends_on).toEqual([])
    expect(plan?.tasks[1].depends_on).toEqual([1])
  })

  it('returns null for broken JSON or an empty task list', () => {
    expect(validatePlan('{not json')).toBeNull()
    expect(validatePlan('{"title":"x","tasks":[]}')).toBeNull()
  })

  it('hides a partial <plan> tag while streaming', () => {
    expect(visibleText('Sure thing. <pl')).toBe('Sure thing.')
    expect(visibleText('Sure thing. <plan>{"ti')).toBe('Sure thing.')
    expect(visibleText('A <p> tag')).toBe('A <p> tag')
  })
})

describe('streamOrcReply', () => {
  function mockGemini(behaviour: Record<string, 'fail' | string[]>) {
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: class {
        getGenerativeModel({ model }: { model: string }) {
          return {
            async generateContentStream() {
              const b = behaviour[model]
              if (b === 'fail' || !b) throw new Error(`404 ${model}`)
              return {
                stream: (async function* () { for (const t of b) yield { text: () => t } })(),
                response: Promise.resolve({ usageMetadata: { totalTokenCount: 42 } }),
              }
            },
          }
        }
      },
    }))
  }

  it('falls back to the next model when the first is unavailable', async () => {
    vi.resetModules()
    mockGemini({ a: 'fail', b: ['Hel', 'lo'] })
    const { streamOrcReply: stream } = await import('@/lib/chat/orc')
    const gen = stream({ system: 's', history: [{ role: 'user', content: 'hi' }], apiKey: 'k', models: ['a', 'b'] })
    let out = ''
    let step = await gen.next()
    while (!step.done) { out += step.value; step = await gen.next() }
    expect(out).toBe('Hello')
    expect(step.value).toEqual({ model: 'b', tokens: 42 })
    vi.doUnmock('@google/generative-ai')
  })

  it('throws when every model fails', async () => {
    vi.resetModules()
    mockGemini({})
    const { streamOrcReply: stream } = await import('@/lib/chat/orc')
    const gen = stream({ system: 's', history: [], apiKey: 'k', models: ['a'] })
    await expect(gen.next()).rejects.toThrow('404 a')
    vi.doUnmock('@google/generative-ai')
  })

  it('refuses to run without an API key', async () => {
    const prev = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY
    await expect(streamOrcReply({ system: 's', history: [] }).next()).rejects.toThrow('GEMINI_API_KEY')
    process.env.GEMINI_API_KEY = prev
  })
})

describe('renderMarkdown', () => {
  it('escapes HTML so replies cannot inject markup', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)> **bold**')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
    expect(html).toContain('<strong>bold</strong>')
  })

  it('renders lists, code and only http(s) links', () => {
    const html = renderMarkdown('- one\n- two\n\n```\nx < y\n```\n[ok](https://a.com) [bad](javascript:alert(1))')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<pre><code>x &lt; y</code></pre>')
    expect(html).toContain('href="https://a.com"')
    expect(html).not.toContain('href="javascript:')
  })
})

describe('planToOrchestratorTasks', () => {
  it('maps 1-based dependencies to generated task ids', async () => {
    const { planToOrchestratorTasks } = await import('@/lib/chat/mission')
    const tasks = planToOrchestratorTasks({
      title: 'm',
      tasks: [
        { dept: 'marketing', label: 'Write post', deliverable: 'draft', depends_on: [] },
        { dept: 'sales', label: 'Send list', deliverable: '', depends_on: [1] },
      ],
    }, 'gemini/x')
    expect(tasks[1].depends_on).toEqual([tasks[0].id])
    expect(tasks[0].action).toBe('write_post')
    expect(tasks[1].expected_deliverable).toBe('Send list')
    expect(tasks.every((t) => t.risk_level === 'low' && t.model === 'gemini/x')).toBe(true)
  })
})
