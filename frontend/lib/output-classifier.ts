// Output classifier — determines storage tier for any content produced by Crost.
//
// Tier 1 DELIVERABLE  → artifacts table (gallery-visible, sandbox lifecycle)
// Tier 2 INTERNAL     → internal_instructions table (never in gallery)
// Tier 3 OPERATIONAL  → company_memo / event_log (narrative summaries)
//
// Conservative default: when in doubt → deliverable. It is easier to demote
// a deliverable than to explain a missing artifact to the founder.

import type { ArtifactTier } from '@/types'

export interface ClassifierInput {
  content: string
  targetFormat?: string          // from detectOutputType() e.g. 'docx', 'xlsx', 'md', 'txt'
  contentType?: string           // from detectOutputType() e.g. 'document', 'code', 'email'
  departmentSlug?: string
  taskHint?: string              // founder's raw task description
  isBinaryFile?: boolean         // already a Buffer (pptx, xlsx, etc.)
  fileSizeBytes?: number
  sourceType?: 'department_task' | 'llm_worker' | 'tool_execution' | 'manual'
}

export interface ClassificationResult {
  tier: ArtifactTier
  reason: string
}

// Action slugs that produce operational summaries, not deliverables
const OPERATIONAL_ACTION_PATTERNS = [
  /email.*(sent|confirmed|delivered)/i,
  /task.*(complete|done|finished|summary)/i,
  /sent.*to.*(contact|email|slack)/i,
  /execution.*(result|summary|log)/i,
  /confirmation.*of/i,
]

// Keywords that signal an internal instruction (directives, prompts, skill guides)
const INTERNAL_INSTRUCTION_PATTERNS = [
  /^#+ (system prompt|skill guide|department directive|agent instruction)/im,
  /when generating.+always (include|use|apply)/i,
  /you (must|should|are required to) (always|never|only)/i,
  /^---\nyou are a/im,
  /^# SKILL:/im,
  /^# DIRECTIVE:/im,
]

export function classifyOutput(input: ClassifierInput): ClassificationResult {
  const {
    content,
    targetFormat,
    contentType,
    departmentSlug,
    taskHint,
    isBinaryFile,
    fileSizeBytes,
    sourceType,
  } = input

  const hint = (taskHint ?? '').toLowerCase()
  const dept = (departmentSlug ?? '').toLowerCase()
  const size = fileSizeBytes ?? Buffer.byteLength(content, 'utf8')

  // ── Tier 2: Internal instruction signals ────────────────────────────────────
  // Only text content can be an internal instruction (no binary directives)
  if (!isBinaryFile && contentType !== 'email') {
    if (INTERNAL_INSTRUCTION_PATTERNS.some(rx => rx.test(content))) {
      return { tier: 'internal', reason: 'Content matches internal instruction pattern (system prompt / skill guide / directive)' }
    }
    // Skill-loading hint from orchestrator
    if (hint.includes('skill guide') || hint.includes('system prompt') || hint.includes('department directive')) {
      return { tier: 'internal', reason: 'Task hint indicates an internal instruction update' }
    }
  }

  // ── Tier 3: Operational output signals ──────────────────────────────────────
  // Small text narrative with no file transformation needed → operational
  if (
    !isBinaryFile &&
    targetFormat === 'txt' &&
    size < 3_000 &&
    OPERATIONAL_ACTION_PATTERNS.some(rx => rx.test(content))
  ) {
    return { tier: 'operational', reason: 'Small narrative text matching operational summary pattern' }
  }

  // Email confirmations from tool execution are operational (the DRAFT is a deliverable,
  // but the "email was sent" result is an operational output)
  if (
    sourceType === 'tool_execution' &&
    contentType === 'email' &&
    size < 2_000
  ) {
    return { tier: 'operational', reason: 'Small email confirmation from tool execution' }
  }

  // ── Tier 1: Deliverable (conservative default) ──────────────────────────────

  // Binary files are always deliverables
  if (isBinaryFile) {
    return { tier: 'deliverable', reason: 'Binary file (pptx/xlsx/docx/pdf/image)' }
  }

  // Explicit formatted file types are always deliverables
  if (targetFormat && ['docx', 'xlsx', 'pptx', 'pdf', 'csv', 'py', 'sql', 'ts', 'js'].includes(targetFormat)) {
    return { tier: 'deliverable', reason: `Formatted output type: ${targetFormat}` }
  }

  // Structured JSON > 1KB from a domain department is a deliverable
  if (size > 1_000 && ['sales', 'marketing', 'finance', 'operations', 'engineering'].includes(dept)) {
    return { tier: 'deliverable', reason: `Structured output from ${dept} department (${size} bytes)` }
  }

  // Markdown documents > 1KB are deliverables (research reports, plans, briefs)
  if (targetFormat === 'md' && size > 1_000) {
    return { tier: 'deliverable', reason: `Markdown document (${size} bytes) — treated as deliverable` }
  }

  // Conservative default
  return { tier: 'deliverable', reason: 'Default: no signals matched internal or operational patterns' }
}
