// lib/engine/orchestrator.ts
// Orc planning loop (runOrchestratorTask) and mission-report synthesis
// (runOrcReport). Extracted verbatim from lib/llm-client.ts during the
// Phase 2 god-module split — no behavior change.

import { createServerSupabaseClient } from '@/lib/supabase'
import type { OrchestratorPlan, OrchestratorTask } from '@/types'
import { generateAndInsertSuggestedActions } from '@/lib/suggested-actions'
import { logDecision } from '@/lib/company-memo'
import {
  fetchOrcContext,
  seedOrcContextFromMemo,
  formatOrcContextForPrompt,
  enrichWithKnowledgeBase,
  formatKbContextForPrompt,
  orcDecisionGate,
  type OrcDecision,
} from '@/lib/orc-decision-gate'
import { detectCapabilityGaps, formatCapabilityGapsForPrompt } from '@/lib/capability-checker'
import { assessGoalRisk } from '@/lib/risk-assessor'
import { computeMonthlySpend } from '@/lib/cost-tracker'
import { resolveOrchestratorDepartment } from './departments'
import { saveContextMemo } from './memo'
import { buildOrcContext, buildFinalPrompt, getModeInstructions, formatConversationHistory } from './prompt'
import { getModel, callLLM } from './model'
import { parseOrchestratorResponse, normalizeClarification } from './parse'
import { logEvent } from './events'
import { log } from '@/lib/log'

// ─── Orchestrator ─────────────────────────────────────────────────────────────

const ORCHESTRATOR_SYSTEM_NOTE = `You are Orc, the company's Chief of Staff. You are a JSON-only orchestration engine. You MUST respond with valid JSON matching this exact schema — no prose, no markdown fences, no commentary before or after:

{
  "is_valid_goal": boolean,
  "is_direct_response": boolean,
  "direct_response": "string or null — use ONLY if is_direct_response is true",
  "clarification_question": "string or null — use ONLY if is_valid_goal is false",
  "response_mode": "assistant|clarify|quick_plan|full_plan|direct_action|command|escalate — confirm or override the pre-classifier hint",
  "plan": {
    "goal": "string",
    "risk_note": "string — mandatory one-sentence risk assessment",
    "data_gathered": { "dept_slug": "string" },
    "tasks": [
      {
        "id": "uuid string",
        "dept": "department slug string",
        "action": "snake_case_action_string",
        "label": "Human readable label",
        "reasoning": "Mandatory non-empty explanation of why this task is needed",
        "expected_deliverable": "description of what this task produces",
        "params": { "key": "value" },
        "risk_level": "low | medium | high | critical",
        "depends_on": ["uuid_of_blocker_task"],
        "model": "cloud | local"
      }
    ]
  }
}

Rules:
1. COMPLEX GOALS: If the goal is clear but requires substantive work, multiple steps, or coordination across departments, set is_valid_goal=true and is_direct_response=false and provide a plan.
2. CONVERSATIONAL QUERIES & TRIVIAL TASKS: If the founder asks a simple question, help request, status check, or explanatory question about the company, or if the request can be answered in a single direct_response without needing a department agent, set is_valid_goal=true and is_direct_response=true and provide the direct_response. DO NOT draft a multi-task plan for these.
3. ACTION VERB TRIGGER: If the goal contains substantive action verbs like "design", "write", "create", "build", "research", "analyze", "draft", "make", "generate", "schedule", "publish", or "execute", you MUST use Planning Mode (is_valid_goal=true, is_direct_response=false). Do NOT perform creative or substantive work in the direct_response; assign it to the correct department.
4. PLANNING THRESHOLD: Reserve Planning Mode for goals that genuinely need one or more department agents to do meaningful work — a real deliverable, a real action (send email, post content, run research), or coordination across multiple steps. The presence of action verbs alone does NOT force Planning Mode if the task is trivially small. Apply judgment: "Write hello world HTML" → direct response; "Write a full email marketing campaign targeting SMBs" → plan.
5. ASSUMPTION OVER INTERROGATION: Do not ask pedantic clarification questions for common abbreviations, social platforms, or standard business terms (e.g., assuming "X" = Twitter, "Insta" = Instagram, "Deck" = Pitch Deck). Make the industry-standard assumption, proceed with the plan, and explicitly document your assumption in the plan's risk_note.
5. AMBIGUOUS GOALS: If the goal is truly non-sensical or critically ambiguous, set is_valid_goal=false and provide a clarification_question.
6. NEVER provide both a plan and a direct_response. If the request is informational or conversational, reply only with direct_response and no plan.
7. ALWAYS provide a risk_note in the plan.
8. You MUST ONLY assign tasks to the PROVIDED list of departments in the "Available Departments" section. Do NOT hallucinate or create new departments.
9. CAPABILITY AWARENESS: You must look end-to-end at the requested goal. NEVER fail silently or attempt to hire external freelancers to bypass missing capabilities. Solo founders use Crost to avoid external costs.
10. SELF-INTRODUCTION: If asked "Who are you?", explain: "I am Orc (short for Orchestrator), your AI Chief of Staff."
11. RESPONSE MODE: A pre-classifier has suggested a response_mode (see ORCHESTRATOR MODE HINT in the prompt). Confirm it in your response_mode field, or override it if your analysis of the full context disagrees. This field is optional but strongly preferred.`

export async function runOrchestratorTask(
  founderInput: string,
  goalId: string,
  conversationHistory: any[] = [],
  forcePlan: boolean = false
): Promise<any> {
  const requestId = Math.random().toString(36).slice(2, 10)
  const t = { start: Date.now(), preProcess: 0, decisionGate: 0, llm: 0 }

  const supabase = createServerSupabaseClient()
  const { data: goalRow } = await supabase.from('goals').select('created_by').eq('id', goalId).single()
  const userId = goalRow?.created_by
  const orcDept = await resolveOrchestratorDepartment(userId)
  const lastMsg = conversationHistory[conversationHistory.length - 1]
  if (lastMsg && lastMsg.role === 'user') {
    await saveContextMemo(goalId, lastMsg.content, userId)
  }

  const { data: allActiveDepts } = await supabase
    .from('departments')
    .select('id, name, slug, status, current_task')
    .eq('activation_stage', 'active')
    .neq('is_orchestrator', true)
    .eq('created_by', userId)

  const activeDeptsList = allActiveDepts ?? []

  // Step 1: Inject recent tasks to handle meta-commands like "Retry the last task"
  const { data: recentTasks } = await supabase
    .from('goal_tasks')
    .select('task_id, label, status, dept_slug, goal_id, created_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(5)

  const formattedRecentTasks = (recentTasks || [])
    .map((t: any) => `- [${t.status.toUpperCase()}] ${t.label} (task_id: ${t.task_id}, goal_id: ${t.goal_id}, Dept: ${t.dept_slug})`)
    .join('\n')

  // Brains 1 + 3: parallel fetch of memo context, structured Orc context, capability
  // inventory, and KB enrichment — all fail-open so nothing blocks goal dispatch.
  const [systemMemory, orcContext, capSummary, kbMatches, monthlyCost] = await Promise.all([
    buildOrcContext(userId),
    fetchOrcContext(userId),
    detectCapabilityGaps(founderInput),
    enrichWithKnowledgeBase(founderInput, userId),
    userId ? computeMonthlySpend(userId) : Promise.resolve(null),
  ])
  t.preProcess = Date.now()

  // Fire-and-forget auto-seed from company_memo on first run
  if (userId) seedOrcContextFromMemo(userId).catch(() => {})

  // Risk assessment (synchronous — uses data already fetched above)
  const riskAssessment = assessGoalRisk(founderInput, orcContext, capSummary.gaps)

  // Budget alert: inject into risk_notes so the decision gate and plan surface it
  if (monthlyCost?.alertLevel === 'critical') {
    riskAssessment.risk_notes.push(
      `API budget is ${monthlyCost.budgetUsedPct}% used this month ($${monthlyCost.totalCostUsd.toFixed(2)} of $${monthlyCost.budgetLimitUsd}) — very close to limit`,
    )
  } else if (monthlyCost?.alertLevel === 'warning') {
    riskAssessment.risk_notes.push(
      `API budget is ${monthlyCost.budgetUsedPct}% used this month ($${monthlyCost.totalCostUsd.toFixed(2)} of $${monthlyCost.budgetLimitUsd})`,
    )
  }

  // Brain 2: classify intent, injecting pre-computed risk notes so the classifier
  // has full context before choosing a response mode.
  const decision = await orcDecisionGate(founderInput, orcContext, conversationHistory, riskAssessment.risk_notes)
  t.decisionGate = Date.now()

  const orcContextSummary = formatOrcContextForPrompt(orcContext)
  const capabilityGapsText = formatCapabilityGapsForPrompt(capSummary)
  const kbContextText = formatKbContextForPrompt(kbMatches)
  const modeInstructions = getModeInstructions(decision.mode)
  const modeHint = [
    `ORCHESTRATOR MODE HINT (pre-classified): ${decision.mode} (confidence: ${decision.confidence.toFixed(2)})`,
    `Reasoning: ${decision.reasoning}`,
    decision.risk_notes.length > 0 ? `Risk flags: ${decision.risk_notes.join('; ')}` : '',
    riskAssessment.assumptions.length > 0 ? `Assumptions: ${riskAssessment.assumptions.join('; ')}` : '',
    modeInstructions ? `Mode instructions: ${modeInstructions}` : '',
  ].filter(Boolean).join('\n')

  const conversationContext = formatConversationHistory(conversationHistory)
  const prompt = [
    `GOAL: ${founderInput}`,
    forcePlan ? 'FORCE PLANNING MODE: The founder has explicitly bypassed clarification and trusts your judgment. You MUST draft the best possible plan now using reasonable assumptions and all available context (System Memory/Memos/KB). DO NOT return is_valid_goal=false. You are authorized to proceed with partial context.' : '',
    modeHint,
    capabilityGapsText ? `Capability Intelligence:\n${capabilityGapsText}` : '',
    kbContextText      ? `Knowledge Base Context:\n${kbContextText}` : '',
    `Available Departments: ${activeDeptsList.map((d: any) => d.slug).join(', ')}`,
    formattedRecentTasks ? `Recent Workspace Tasks:\n${formattedRecentTasks}` : '',
    `Conversation History:\n${conversationContext}`,
    orcContextSummary ? `Structured Company Context:\n${orcContextSummary}` : '',
    `System Memory:\n${systemMemory}`,
  ].filter(Boolean).join('\n\n')

  const finalPrompt = await buildFinalPrompt(
    orcDept?.persona_prompt ?? 'You are the Orchestrator.',
    prompt,
    orcDept?.capabilities ?? [],
    orcDept?.restrictions ?? [],
    orcDept?.slug,
    goalId
  )

  const { model: planModel, provider: planProvider } = await getModel('planning', userId)
  const { content, tokensUsed } = await callLLM(planModel, finalPrompt, ORCHESTRATOR_SYSTEM_NOTE, userId, planProvider)
  t.llm = Date.now()
  console.log(JSON.stringify({
    type: 'orc_timing',
    requestId,
    userId: userId ?? null,
    goalId,
    phases: {
      preProcess:   t.preProcess   - t.start,
      decisionGate: t.decisionGate - t.preProcess,
      llm:          t.llm          - t.decisionGate,
    },
    totalMs: t.llm - t.start,
  }))
  let result = parseOrchestratorResponse(content)

  // ─── Hallucination Protection ──────────────────────────────────────────────
  // Validate that all proposed departments actually exist in the DB.
  if (result.is_valid_goal && result.plan?.tasks) {
    const activeSlugs = activeDeptsList.map((d: any) => d.slug.toLowerCase())
    const invalidTasks = result.plan.tasks.filter((t: any) => !activeSlugs.includes(t.dept.toLowerCase()))

    if (invalidTasks.length > 0) {
      log.warn('[Orchestrator] Hallucination detected — forcing retry', { module: 'engine/orchestrator', goalId, userId, unknownDepartments: invalidTasks.map((t: any) => t.dept) })

      const retryPrompt = `${prompt}\n\nCRITICAL ERROR: You proposed tasks for departments that do NOT exist: [${invalidTasks.map((t: any) => t.dept).join(', ')}]. \nONLY use these available departments: [${activeSlugs.join(', ')}]. \nRedraft the plan using ONLY these departments.`

      const retryResponse = await callLLM(planModel, await buildFinalPrompt(
        orcDept?.persona_prompt ?? 'You are the Orchestrator.',
        retryPrompt,
        orcDept?.capabilities ?? [],
        orcDept?.restrictions ?? [],
        orcDept?.slug,
        goalId
      ), ORCHESTRATOR_SYSTEM_NOTE, userId, planProvider)

      result = parseOrchestratorResponse(retryResponse.content)

      // Secondary validation check — if still invalid after one retry, mark goal as error
      // rather than leaving it stuck in 'planning' forever (HIGH-1 fix).
      const secondaryInvalid = (result.plan?.tasks || []).filter((t: any) => !activeSlugs.includes(t.dept.toLowerCase()))
      if (secondaryInvalid.length > 0) {
        const badDepts = secondaryInvalid.map((t: any) => t.dept).join(', ')
        await supabase.from('goals').update({
          status: 'error',
          orc_notes: `Orchestrator repeatedly proposed invalid departments after retry: [${badDepts}]. Available: [${activeSlugs.join(', ')}].`,
        }).eq('id', goalId)
        throw new Error(`Orchestrator failed to respect department boundaries after retry. Proposed unknown depts: ${badDepts}`)
      }
    }
  }

  const previousAssistantMessage = [...conversationHistory].reverse().find((m) => m.role === 'assistant')?.content
  const latestUserMessage = [...conversationHistory].reverse().find((m) => m.role === 'user')?.content
  const repeatedClarification = result.is_valid_goal === false
    && !!previousAssistantMessage
    && normalizeClarification(result.clarification_question) !== ''
    && normalizeClarification(result.clarification_question) === normalizeClarification(previousAssistantMessage)
    && !!latestUserMessage

  if (repeatedClarification && !forcePlan) {
    const retryPrompt = `${prompt}\n\nIMPORTANT: The founder already answered your prior clarification. You repeated yourself. Draft the best possible plan now using the founder's latest reply and reasonable assumptions.`
    const retryResponse = await callLLM(planModel, await buildFinalPrompt(
      orcDept?.persona_prompt ?? 'You are the Orchestrator.',
      retryPrompt,
      orcDept?.capabilities ?? [],
      orcDept?.restrictions ?? [],
      orcDept?.slug,
      goalId
    ), ORCHESTRATOR_SYSTEM_NOTE, userId, planProvider)
    result = parseOrchestratorResponse(retryResponse.content)
  }

  if (!result.ok) throw new Error(result.reason)

  // Persist the pre-classifier decision regardless of which branch we take below
  const orcDecisionPayload: OrcDecision = result.response_mode
    ? { ...decision, mode: result.response_mode } // LLM overrode the pre-classifier
    : decision
  await supabase.from('goals').update({
    response_mode: orcDecisionPayload.mode,
    orc_decision: {
      mode:             orcDecisionPayload.mode,
      confidence:       orcDecisionPayload.confidence,
      reasoning:        orcDecisionPayload.reasoning,
      risk_notes:       orcDecisionPayload.risk_notes,
      risk_tier:        riskAssessment.tier,
    },
  }).eq('id', goalId)

  // Record in decision log for the self-improvement loop (fire-and-forget)
  if (userId) {
    void Promise.resolve(supabase.from('orc_decision_log').insert({
      user_id:         userId,
      goal_id:         goalId,
      decision_type:   'response_mode_selection',
      founder_intent:  founderInput.slice(0, 500),
      orc_choice:      orcDecisionPayload.mode,
      confidence:      orcDecisionPayload.confidence,
      assumptions:     { list: riskAssessment.assumptions, request_id: requestId },
      risk_tier:       riskAssessment.tier,
      risk_notes:      orcDecisionPayload.risk_notes,
      capability_gaps: capSummary.gaps.map(g => ({ slug: g.slug, name: g.name, availability: g.availability })),
    })).catch(() => {})
  }

  if (result.is_valid_goal === false) {
    const updatedHistory = [...conversationHistory, { role: 'assistant', content: result.clarification_question, ts: new Date().toISOString() }]
    await supabase.from('goals').update({ status: 'clarifying', orc_conversation: updatedHistory }).eq('id', goalId)
    return result
  }

  // Case 2: Direct Response (Assistant mode)
  if (result.is_direct_response === true) {
    const directResponse = result.direct_response || 'I have processed your request.'
    const updatedHistory = [...conversationHistory, { role: 'assistant', content: directResponse, ts: new Date().toISOString() }]

    await supabase.from('goals').update({
      status: 'completed',
      outcome: directResponse,
      orc_conversation: updatedHistory
    }).eq('id', goalId)

    // Also create a memo so it shows up in the UI (SynthesisReportCard)
    await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'Orchestrator',
      title: `[DIRECT RESPONSE] ${founderInput.slice(0, 50) || 'Assistant Action'}`,
      body: directResponse,
      priority: 'normal',
      source_type: 'orchestrator',
      created_by: userId
    })

    await logEvent({
      event_type: 'goal_completed',
      department_slug: 'orchestrator',
      goal_id: goalId,
      description: `Direct response provided: "${directResponse.slice(0, 100)}..."`,
      tokens_used: tokensUsed,
      created_by: userId,
      metadata: { direct_response: directResponse, request_id: requestId }
    })

    return result
  }

  const { plan } = result
  if (!plan) {
    throw new Error('Orchestrator proposed a valid goal but failed to provide a plan.')
  }
  await supabase.from('goals').update({ orchestrator_plan: plan, risk_note: plan.risk_note, status: 'awaiting_approval' }).eq('id', goalId)

  await supabase.from('goal_tasks').delete().eq('goal_id', goalId).in('status', ['pending', 'planned', 'awaiting_approval'])

  if (plan.tasks.length > 0) {
    // Determine default model for tasks if not specified in plan
    const { model: execModel } = await getModel('execution', userId)

    const taskRows = plan.tasks.map((t: any) => ({
      goal_id: goalId,
      task_id: t.id,
      created_by: userId,
      dept_slug: t.dept,
      action: t.action,
      label: t.label,
      reasoning: t.reasoning,
      expected_deliverable: t.expected_deliverable,
      params: t.params,
      risk_level: t.risk_level,
      depends_on: t.depends_on,
      model: t.model === 'cloud' ? execModel : (t.model || execModel),
      status: 'pending',
    }))
    await supabase.from('goal_tasks').insert(taskRows)
  }

  await logEvent({
    event_type: 'plan_drafted',
    department_slug: 'orchestrator',
    goal_id: goalId,
    description: `Plan drafted — ${plan.tasks.length} tasks.`,
    tokens_used: tokensUsed,
    created_by: userId,
    metadata: { request_id: requestId },
  })

  return result
}

// ─── Orc Synthesis Report ───────────────────────────────────────────────────

export async function runOrcReport(goalId: string): Promise<void> {
  const supabase = createServerSupabaseClient()
  const { data: goal } = await supabase.from('goals').select('*').eq('id', goalId).single()
  if (!goal) return

  // Idempotency: skip if a Mission Report already exists for this goal.
  // Match both current prefix '[Mission Report]' and legacy '[ORC REPORT]' so stale rows
  // from before the rename are still detected and don't trigger a duplicate.
  const { data: existingReport } = await supabase
    .from('company_memos')
    .select('id')
    .eq('goal_id', goalId)
    .or('title.ilike.[Mission Report]%,title.ilike.[ORC REPORT]%')
    .maybeSingle()
  if (existingReport) return

  const { data: memos } = await supabase.from('company_memos').select('*').eq('goal_id', goalId)
  if (!memos || memos.length === 0) return

  const context = memos.map((m: any) => `### [${m.from_department}] ${m.title}\n${m.body}`).join('\n\n')
  const prompt = `Goal: ${goal.founder_input}\n\nDepartment findings:\n${context}\n\nWrite a concise mission debrief. Use ## markdown headers (not **bold** pseudo-headers). Lead with the outcome, then key findings, then what's next. No preamble, no "I am pleased to present". Be direct and specific.`

  try {
    const { model: reportModel } = await getModel('summarization', goal.created_by)
    const { content } = await callLLM(reportModel, prompt, "You are Orc, a sharp Chief of Staff. Write concise, direct mission debriefs in clean markdown. Use ## and ### headers for sections. No ceremonial language. Get straight to the point.", goal.created_by)
    const { data: newReport } = await supabase.from('company_memos').insert({
      goal_id: goalId,
      from_department: 'Orchestrator',
      title: `[Mission Report] ${goal.title}`,
      body: content,
      priority: 'high',
      source_type: 'orchestrator',
      created_by: goal.created_by
    }).select('id').single()

    if (newReport) {
      // DUAL-WRITE: Log as a strategic decision in singular company_memo (§8)
      if (goal.created_by) {
        logDecision(supabase, goal.created_by, {
          id: newReport.id,
          title: `Mission Outcome: ${goal.title}`,
          context: goal.founder_input,
          decision: content.slice(0, 1000), // Summarized version for decision log
          reasoning: 'Strategic synthesis generated by Orc after department execution.',
          made_by: 'orc',
          created_at: new Date().toISOString()
        }).catch(() => {})
      }

      // Spec §6.1 Generate Suggested Next Actions for this Mission Report
      await generateAndInsertSuggestedActions({
        source_entity_type: 'mission_report',
        source_entity_id: newReport.id,
        goal_id: goalId,
        // Phase 5: richest text signal available for schedule_recurring
        // mission-type detection — goal title + the founder's original ask.
        mission_context: `${goal.title ?? ''} ${goal.founder_input ?? ''}`,
        created_by: goal.created_by
      })

      // Spec §7 — emit the canonical event so the live events panel reflects completion
      await logEvent({
        event_type: 'goal_mission_report_written',
        department_slug: 'orchestrator',
        goal_id: goalId,
        description: `Mission Report written for goal: "${goal.title}"`,
        created_by: goal.created_by,
      })
    }
  } catch (err) {
    log.error('[runOrcReport] Failed', { module: 'engine/orchestrator', goalId, userId: goal.created_by, error: String(err) })
  }
}
