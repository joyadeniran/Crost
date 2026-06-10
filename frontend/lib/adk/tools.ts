// lib/adk/tools.ts
// Google ADK FunctionTool definitions for Crost's agent capabilities.
// These tools are used by OrcAgent and DepartmentAgents.
// Server-side ONLY.

import { FunctionTool } from '@google/adk'
import { Schema, Type } from '@google/genai'
import { createDbClient } from '../db'
import { gcsStorage } from '../gcs'

// ─── Knowledge Base Tool ──────────────────────────────────────────────────────

export const searchKnowledgeBase = new FunctionTool({
  name: 'search_knowledge_base',
  description: 'Search the company knowledge base for relevant information, documents, and context. Use this before starting any task to gather relevant background.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The search query' },
      userId: { type: Type.STRING, description: 'The user ID for scoping results' },
      limit: { type: Type.NUMBER, description: 'Max results (default 5)' },
    },
    required: ['query', 'userId'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const { query, userId, limit = 5 } = params
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
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.STRING, description: 'The user ID' },
      limit: { type: Type.NUMBER, description: 'Number of memos to retrieve (default 10)' },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Filter by tags' },
    },
    required: ['userId'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const { userId, limit = 10 } = params
    const db = createDbClient()
    const query = db
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
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.STRING, description: 'The user ID' },
      goalId: { type: Type.STRING, description: 'The goal this memo relates to' },
      departmentSlug: { type: Type.STRING, description: 'The department writing the memo' },
      title: { type: Type.STRING, description: 'Memo title' },
      body: { type: Type.STRING, description: 'Memo content (markdown supported)' },
      priority: { type: Type.STRING, description: 'Priority level (low, normal, high)' },
      tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Tags for the memo' },
    },
    required: ['userId', 'departmentSlug', 'title', 'body'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const { userId, goalId, departmentSlug, title, body, priority = 'normal', tags = [] } = params
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
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.STRING, description: 'The user ID' },
      goalId: { type: Type.STRING, description: 'The goal this artifact is for' },
      departmentSlug: { type: Type.STRING, description: 'The department creating the artifact' },
      title: { type: Type.STRING, description: 'Artifact title' },
      content: { type: Type.STRING, description: 'The artifact content (markdown, JSON, CSV, or plain text)' },
      artifactType: { type: Type.STRING, description: 'Artifact type: document, spreadsheet, data, or report' },
      taskLabel: { type: Type.STRING, description: 'The task label for filename generation' },
    },
    required: ['userId', 'departmentSlug', 'title', 'content'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const { userId, goalId, departmentSlug, title, content, artifactType = 'document', taskLabel } = params
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
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: { type: Type.STRING, description: 'The user ID' },
      goalId: { type: Type.STRING, description: 'The goal ID' },
      departmentName: { type: Type.STRING, description: 'The department requesting approval' },
      departmentSlug: { type: Type.STRING, description: 'The department slug' },
      actionLabel: { type: Type.STRING, description: 'Short description of what action will be taken' },
      reasoning: { type: Type.STRING, description: 'Why this action is needed' },
      actionType: { type: Type.STRING, description: 'Action type: email, calendar, github, slack, database, api_call, or other' },
      payload: { type: Type.OBJECT, description: 'The parameters that will be used for the action' },
      riskLevel: { type: Type.STRING, description: 'Risk level: low, medium, or high' },
    },
    required: ['userId', 'departmentName', 'departmentSlug', 'actionLabel', 'reasoning'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const {
      userId, goalId, departmentName, departmentSlug,
      actionLabel, reasoning, actionType = 'other', payload = {}, riskLevel = 'medium'
    } = params
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
  parameters: {
    type: Type.OBJECT,
    properties: {
      goalId: { type: Type.STRING, description: 'The goal ID to update' },
      status: { type: Type.STRING, description: 'Status: executing, completed, failed, or waiting_approval' },
      summary: { type: Type.STRING, description: 'Brief summary of what was accomplished' },
    },
    required: ['goalId', 'status'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const { goalId, status, summary } = params
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
  parameters: {
    type: Type.OBJECT,
    properties: {
      goalId: { type: Type.STRING, description: 'The goal ID' },
      departmentSlug: { type: Type.STRING, description: 'The department slug' },
      eventType: { type: Type.STRING, description: 'The type of event (e.g., "task_started", "tool_called", "decision_made")' },
      description: { type: Type.STRING, description: 'Human-readable description of what happened' },
      userId: { type: Type.STRING, description: 'The user ID' },
      metadata: { type: Type.OBJECT, description: 'Additional metadata' },
    },
    required: ['eventType', 'description'],
  } as Schema,
  execute: async (input: unknown) => {
    const params = input as Record<string, any>
    const { goalId, departmentSlug, eventType, description, userId, metadata = {} } = params
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
