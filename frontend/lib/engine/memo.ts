// lib/engine/memo.ts
// Memo brief/context helpers used when building prompts and during dialogue.
// Extracted verbatim from lib/llm-client.ts during the Phase 2 god-module
// split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'
import { logDecision } from '@/lib/company-memo'
import { log } from '@/lib/log'

export async function getMemoBrief(departmentSlug: string): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()

    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department')
      .in('priority', ['high', 'urgent'])
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .not('read_by', 'cs', `{${departmentSlug}}`)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!memos || memos.length === 0) return ''

    return memos
      .map((m: any) => `[${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})\n${m.priority === 'urgent' ? m.body : m.body.slice(0, 500)}`)
      .join('\n\n')
  } catch {
    return ''
  }
}

export async function getMemos(goalId: string, lastN: number = 10): Promise<string> {
  try {
    const supabase = createServerSupabaseClient()
    const now = new Date().toISOString()

    const { data: memos } = await supabase
      .from('company_memos')
      .select('title, body, priority, from_department')
      .eq('goal_id', goalId)
      .or(`valid_until.is.null,valid_until.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(lastN)

    if (!memos || memos.length === 0) return ''

    return memos
      .map((m: any) => `[GOAL MEMO][${m.priority.toUpperCase()}] ${m.title} (from: ${m.from_department})\n${m.body.slice(0, 800)}`)
      .join('\n\n')
  } catch {
    return ''
  }
}

export async function saveContextMemo(goalId: string, content: string, userId: string | null) {
  const supabase = createServerSupabaseClient()
  const validUntil = new Date()
  validUntil.setDate(validUntil.getDate() + 7)

  try {
    await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'founder',
      title: 'Founder Context (Clarification)',
      body: content,
      priority: 'high',
      source_type: 'founder',
      confidence: 1.0,
      valid_until: validUntil.toISOString(),
      is_current_context: true,
      version_tag: `v_${Date.now()}`,
      created_by: userId
    })

    // DUAL-WRITE: Log as a decision in singular company_memo (§8)
    // Phase 5 fix: same observability fix as runOrcReport's identical
    // pattern — a failure here used to be completely invisible.
    if (userId) {
      logDecision(supabase, userId, {
        id: crypto.randomUUID(),
        title: 'Founder Clarification',
        context: `Goal ID: ${goalId}`,
        decision: content,
        reasoning: 'Direct founder input provided during orchestration.',
        made_by: 'founder',
        created_at: new Date().toISOString()
      }).catch((err) => log.warn('[saveContextMemo] company_memo dual-write (logDecision) failed', { module: 'engine/memo', goalId, userId, error: String(err) }))
    }
  } catch (err) {
    log.error('[saveContextMemo] Failed', { module: 'engine/memo', goalId, userId, error: String(err) })
  }
}
