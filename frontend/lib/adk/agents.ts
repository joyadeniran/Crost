// lib/adk/agents.ts
// Google ADK LlmAgent definitions for Crost's multi-agent OS.
// OrcAgent orchestrates DepartmentAgents as ADK sub-agents.
// Server-side ONLY.

import { LlmAgent } from '@google/adk'
import { createDbClient } from '../db'
import { makeGeminiModel } from '../gemini-client'
import {
  searchKnowledgeBase,
  readCompanyMemo,
  writeToMemo,
  createArtifact,
  requestApproval,
  updateGoalStatus,
  logTaskEvent,
  CROST_TOOLS,
} from './tools'

// ─── Orc Agent (Chief of Staff) ───────────────────────────────────────────────

const ORC_INSTRUCTION = `You are Orc, the AI Chief of Staff powered by Google Gemini, running inside Crost — a Human-in-the-Loop Company Operating System.

Your role:
1. Understand the founder's goal deeply
2. Gather context (search knowledge base, read memos)
3. Plan execution: identify 2-5 concrete tasks for specialist departments
4. Coordinate execution — transfer tasks to the right department agent
5. Synthesize results into a clear mission report
6. Mark the goal as completed

OPERATING RULES:
- ALWAYS call search_knowledge_base and read_company_memo before planning
- Break every goal into discrete, actionable tasks
- For each task: transfer to the relevant department agent with specific instructions
- NEVER take external actions without human approval (request_human_approval)
- Log major decisions with log_task_event
- End every goal with a write_to_memo (mission report) and update_goal_status

DEPARTMENT ROUTING:
- Marketing/content/campaigns/brand → transfer to 'marketing' agent
- Engineering/technical/code/API → transfer to 'engineering' agent
- Sales/revenue/customers/outreach → transfer to 'sales' agent
- Research/analysis/competitive → transfer to 'research' agent
- Operations/process/admin → transfer to 'operations' agent
- If no specialist exists: execute directly using available tools

Be decisive. Be thorough. Complete what you start.`

const DEPARTMENT_INSTRUCTION = (dept: DepartmentInfo) => `${dept.personaPrompt}

You are the ${dept.name} department AI agent inside Crost, powered by Google Gemini.

CAPABILITIES: ${dept.capabilities.join(', ')}
RESTRICTIONS: ${dept.restrictions.join(', ')}

OPERATING RULES:
- Always log your work with log_task_event
- Save deliverables with create_artifact
- Document insights with write_to_memo
- Request approval BEFORE taking any external action (emails, API calls, posts)
- Be specific and actionable
- When done: return summary to Orc by transferring back`

// ─── Types ────────────────────────────────────────────────────────────────────

interface DepartmentInfo {
  slug: string
  name: string
  personaPrompt: string
  capabilities: string[]
  restrictions: string[]
}

// Department tools (subset of all Crost tools, excluding goal management)
const DEPT_TOOLS = [
  searchKnowledgeBase,
  readCompanyMemo,
  writeToMemo,
  createArtifact,
  requestApproval,
  logTaskEvent,
]

// ─── Agent factories ──────────────────────────────────────────────────────────

export function createDepartmentAgent(dept: DepartmentInfo): LlmAgent {
  return new LlmAgent({
    name: dept.slug,
    description: `${dept.name} specialist agent. Capabilities: ${dept.capabilities.slice(0, 3).join(', ')}`,
    model: makeGeminiModel('gemini-2.0-flash'),
    instruction: DEPARTMENT_INSTRUCTION(dept),
    tools: DEPT_TOOLS,
  })
}

// Fallback built-in departments if DB has none
const DEFAULT_DEPARTMENTS: DepartmentInfo[] = [
  {
    slug: 'marketing',
    name: 'Marketing',
    personaPrompt: 'You are a strategic marketing expert.',
    capabilities: ['content creation', 'competitive analysis', 'campaign planning', 'brand strategy'],
    restrictions: ['cannot send emails without approval'],
  },
  {
    slug: 'engineering',
    name: 'Engineering',
    personaPrompt: 'You are a senior software engineer.',
    capabilities: ['technical analysis', 'architecture planning', 'code review', 'API design'],
    restrictions: ['cannot push code without approval'],
  },
  {
    slug: 'sales',
    name: 'Sales',
    personaPrompt: 'You are an experienced sales strategist.',
    capabilities: ['sales strategy', 'prospect research', 'pitch crafting', 'pipeline analysis'],
    restrictions: ['cannot send emails without approval'],
  },
  {
    slug: 'research',
    name: 'Research',
    personaPrompt: 'You are a rigorous research analyst.',
    capabilities: ['market research', 'data analysis', 'competitive intelligence', 'trend analysis'],
    restrictions: ['read-only analysis only'],
  },
  {
    slug: 'operations',
    name: 'Operations',
    personaPrompt: 'You are an operations and process expert.',
    capabilities: ['process optimization', 'documentation', 'project planning', 'resource allocation'],
    restrictions: ['cannot modify systems without approval'],
  },
]

async function loadActiveDepartments(userId?: string): Promise<DepartmentInfo[]> {
  try {
    const db = createDbClient()
    const { data } = await db
      .from('departments')
      .select('slug, name, persona_prompt, capabilities, restrictions, created_by')
      .eq('activation_stage', 'active')
      .order('name', { ascending: true })

    if (!data || (data as any[]).length === 0) return DEFAULT_DEPARTMENTS

    const filtered = (data as any[]).filter(
      (d: any) => d.created_by === null || d.created_by === userId
    )

    if (filtered.length === 0) return DEFAULT_DEPARTMENTS

    return filtered.map((d: any) => ({
      slug: d.slug as string,
      name: d.name as string,
      personaPrompt: (d.persona_prompt as string) ?? '',
      capabilities: Array.isArray(d.capabilities) ? (d.capabilities as string[]) : [],
      restrictions: Array.isArray(d.restrictions) ? (d.restrictions as string[]) : [],
    }))
  } catch {
    return DEFAULT_DEPARTMENTS
  }
}

// ─── Build the full agent tree ────────────────────────────────────────────────

export async function buildAgentTree(userId?: string): Promise<LlmAgent> {
  const departments = await loadActiveDepartments(userId)
  const subAgents = departments.map(createDepartmentAgent)

  return new LlmAgent({
    name: 'orc',
    description: 'Chief of Staff — orchestrates all departments to execute founder goals',
    model: makeGeminiModel('gemini-2.0-flash'),
    instruction: ORC_INSTRUCTION,
    tools: CROST_TOOLS,
    subAgents,
  })
}
