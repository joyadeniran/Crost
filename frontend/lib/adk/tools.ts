// lib/adk/tools.ts
// Google ADK FunctionTool definitions for Crost's agent capabilities.
// These tools are used by OrcAgent and DepartmentAgents.
// Server-side ONLY.

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import { createDbClient } from '../db'
import { gcsStorage } from '../gcs'

// ─── Knowledge Base Tool ──────────────────────────────────────────────────────

export const searchKnowledgeBase = new FunctionTool({
  name: 'search_knowledge_base',
  description: 'Search the company knowledge base for relevant information, documents, and context. Use this before starting any task to gather relevant background.',
  parameters: z.object({
    query: z.string().describe('The search query'),
    userId: z.string().describe('The user ID for scoping results'),
    limit: z.number().optional().describe('Max results (default 5)'),
  }),
  execute: async ({ query, userId, limit = 5 }) => {
    try {
      const db = createDbClient()
      const { data: files } = await db
        .from('knowledge_base_files')
        .select('id, title, extracted_summary, category, file_name')
        .eq('created_by', userId)
        .ilike('title', `%${query}%`)
        .limit(limit)

      return {
        results: (files ?? []).map((f: any) => ({
          id: f.id,
          title: f.title,
          summary: f.extracted_summary,
          category: f.category,
        })),
        count: (files ?? []).length,
      }
    } catch (err: any) {
      return { error: err.message, results: [] }
    }
  },
})

// ─── Company Memo Tool ────────────────────────────────────────────────────────

export const readCompanyMemo = new FunctionTool({
  name: 'read_company_memo',
  description: 'Read recent company memos to understand current company state, active strategies, and context.',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    limit: z.number().optional().describe('Number of memos to retrieve (default 10)'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
  }),
  execute: async ({ userId, limit = 10, tags }) => {
    const db = createDbClient()
    let query = db
      .from('company_memos')
      .select('id, title, body, priority, from_department, tags, created_at')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data } = await query
    return { memos: data ?? [] }
  },
})

export const writeToMemo = new FunctionTool({
  name: 'write_to_memo',
  description: 'Write a memo to the company knowledge log. Use this to document decisions, insights, and completed work.',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().optional().describe('The goal this memo relates to'),
    departmentSlug: z.string().describe('The department writing the memo'),
    title: z.string().describe('Memo title'),
    body: z.string().describe('Memo content (markdown supported)'),
    priority: z.enum(['low', 'normal', 'high']).optional().describe('Priority level'),
    tags: z.array(z.string()).optional().describe('Tags for the memo'),
  }),
  execute: async ({ userId, goalId, departmentSlug, title, body, priority = 'normal', tags = [] }) => {
    const db = createDbClient()
    const { data, error } = await db
      .from('company_memos')
      .insert({
        goal_id: goalId ?? null,
        from_department: departmentSlug,
        title,
        body,
        priority,
        tags,
        source_type: 'adk_agent',
        confidence: 0.9,
        created_by: userId,
      })

    if (error) return { success: false, error: error.message }
    return { success: true, memoId: (data as any)?.[0]?.id }
  },
})

// ─── Artifact Tool ────────────────────────────────────────────────────────────

export const createArtifact = new FunctionTool({
  name: 'create_artifact',
  description: 'Save a work product (document, spreadsheet, report, analysis) as a company artifact. The content will be stored and linked to the goal.',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().optional().describe('The goal this artifact is for'),
    departmentSlug: z.string().describe('The department creating the artifact'),
    title: z.string().describe('Artifact title'),
    content: z.string().describe('The artifact content (markdown, JSON, CSV, or plain text)'),
    artifactType: z.enum(['document', 'spreadsheet', 'data', 'report']).optional(),
    taskLabel: z.string().optional().describe('The task label for filename generation'),
  }),
  execute: async ({ userId, goalId, departmentSlug, title, content, artifactType = 'document', taskLabel }) => {
    try {
      const db = createDbClient()

      const cleanLabel = (taskLabel ?? title)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50)

      const ext = content.trim().startsWith('{') || content.trim().startsWith('[') ? 'json' : 'md'
      const fileName = `goals/${goalId ?? 'global'}/${cleanLabel}-${Date.now()}.${ext}`

      const { data: uploadData } = await gcsStorage
        .from('artifacts')
        .upload(fileName, content, { contentType: ext === 'json' ? 'application/json' : 'text/markdown' })

      const fileUrl = uploadData?.path
        ? `https://storage.googleapis.com/${process.env.GCS_BUCKET}/artifacts/${fileName}`
        : null

      const { data: artifact } = await db
        .from('artifacts')
        .insert({
          goal_id: goalId ?? null,
          department_slug: departmentSlug,
          title,
          body: content.substring(0, 500), // preview
          artifact_type: artifactType,
          file_url: fileUrl,
          file_extension: ext,
          file_size: Buffer.byteLength(content, 'utf8'),
          source_type: 'adk_agent',
          created_by: userId,
        })

      return { success: true, artifactId: (artifact as any)?.[0]?.id, fileUrl }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
})

// ─── Approval Tool ────────────────────────────────────────────────────────────

export const requestApproval = new FunctionTool({
  name: 'request_human_approval',
  description: 'Request founder approval before taking any external action (sending emails, posting messages, creating records, pushing to GitHub, etc.). REQUIRED before any action that affects systems outside Crost.',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    goalId: z.string().optional().describe('The goal ID'),
    departmentName: z.string().describe('The department requesting approval'),
    departmentSlug: z.string().describe('The department slug'),
    actionLabel: z.string().describe('Short description of what action will be taken'),
    reasoning: z.string().describe('Why this action is needed'),
    actionType: z.enum(['email', 'calendar', 'github', 'slack', 'database', 'api_call', 'other']).optional(),
    payload: z.record(z.unknown()).optional().describe('The parameters that will be used for the action'),
    riskLevel: z.enum(['low', 'medium', 'high']).optional(),
  }),
  execute: async ({
    userId, goalId, departmentName, departmentSlug,
    actionLabel, reasoning, actionType = 'other', payload = {}, riskLevel = 'medium'
  }) => {
    const db = createDbClient()
    const { data, error } = await db
      .from('approval_queue')
      .insert({
        department_name: departmentName,
        department_slug: departmentSlug,
        action_type: actionType,
        action_label: actionLabel,
        reasoning,
        payload,
        risk_level: riskLevel,
        goal_id: goalId ?? null,
        status: 'pending',
        created_by: userId,
      })

    if (error) return { success: false, error: error.message }
    const approvalId = (data as any)?.[0]?.id
    return {
      success: true,
      approvalId,
      message: `Approval request created. Waiting for founder to review: "${actionLabel}"`,
      status: 'pending_approval',
    }
  },
})

// ─── Goal Management Tools ────────────────────────────────────────────────────

export const updateGoalStatus = new FunctionTool({
  name: 'update_goal_status',
  description: 'Update the status of the current goal. Use "completed" when all tasks are done, "failed" if the goal cannot be achieved.',
  parameters: z.object({
    goalId: z.string().describe('The goal ID to update'),
    status: z.enum(['executing', 'completed', 'failed', 'waiting_approval']),
    summary: z.string().optional().describe('Brief summary of what was accomplished'),
  }),
  execute: async ({ goalId, status, summary }) => {
    const db = createDbClient()
    const updateData: any = { status, updated_at: new Date().toISOString() }
    if (summary) updateData.result = summary

    const { error } = await db
      .from('goals')
      .update(updateData)
      .eq('id', goalId)

    return error ? { success: false, error: error.message } : { success: true, status }
  },
})

export const logTaskEvent = new FunctionTool({
  name: 'log_task_event',
  description: 'Log an event to the goal event stream for transparency and debugging.',
  parameters: z.object({
    goalId: z.string().optional(),
    departmentSlug: z.string().optional(),
    eventType: z.string().describe('The type of event (e.g., "task_started", "tool_called", "decision_made")'),
    description: z.string().describe('Human-readable description of what happened'),
    userId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
  }),
  execute: async ({ goalId, departmentSlug, eventType, description, userId, metadata = {} }) => {
    const db = createDbClient()
    await db.from('event_log').insert({
      goal_id: goalId ?? null,
      department_slug: departmentSlug ?? 'adk',
      event_type: eventType,
      description: description.substring(0, 200),
      metadata,
      created_by: userId ?? null,
      source: 'adk_agent',
    })
    return { logged: true }
  },
})

// ─── All tools export ─────────────────────────────────────────────────────────

export const CROST_TOOLS = [
  searchKnowledgeBase,
  readCompanyMemo,
  writeToMemo,
  createArtifact,
  requestApproval,
  updateGoalStatus,
  logTaskEvent,
]
