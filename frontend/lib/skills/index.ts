/**
 * Skills Layer — Crost Spec §9.5
 *
 * Skills are reusable folders of best practices that teach the LLM how to produce
 * high-quality, consistent output for a given artefact type. Departments load the
 * relevant skills at task time; the content is injected into the department prompt
 * before the LLM call via buildFinalPrompt().
 *
 * Usage:
 *   const { content, slugs } = await loadSkillsForTask(task.action, dept, task.params)
 *   // Pass `content` into buildFinalPrompt as the `skillContent` parameter.
 *   // Write `slugs` into the artifacts.skills_used column.
 */

import fs from 'fs'
import path from 'path'

// ─── Skill slug registry ──────────────────────────────────────────────────────

/** All valid MVP skill slugs. */
export type SkillSlug = 'pptx' | 'docx' | 'xlsx' | 'pdf' | 'pitch_deck' | 'code'

/** Canonical directory for skill files. */
const SKILLS_DIR = path.join(process.cwd(), 'lib', 'skills')

// ─── Action → skill slug mappings ────────────────────────────────────────────

/**
 * Keywords in task.action that trigger each skill.
 * Order matters: more specific entries should come first.
 * pitch_deck is always co-loaded with pptx (handled in loadSkillsForTask).
 */
const ACTION_SKILL_MAP: Array<{ keywords: string[]; slugs: SkillSlug[] }> = [
  // Source Code / Technical
  {
    keywords: [
      'write_code',
      'develop_feature',
      'refactor_code',
      'create_script',
      'configure_service',
      'implement_logic',
      'write_sql',
      'create_schema',
      'develop_component',
      'code',
      'script',
      'implementation',
    ],
    slugs: ['code'],
  },
  // Pitch deck — meta-skill, must come before generic pptx
  {
    keywords: [
      'pitch_deck',
      'pitch deck',
      'investor_deck',
      'investor deck',
      'fundraising_deck',
      'fundraising deck',
      'seed_deck',
      'series_a_deck',
    ],
    slugs: ['pptx', 'pitch_deck'],
  },
  // PowerPoint / presentation
  {
    keywords: [
      'create_presentation',
      'create_pptx',
      'build_slides',
      'generate_slides',
      'generate_presentation',
      'write_presentation',
      'make_slides',
      'presentation',
      'slides',
    ],
    slugs: ['pptx'],
  },
  // Word / document
  {
    keywords: [
      'create_document',
      'create_doc',
      'write_report',
      'draft_document',
      'write_brief',
      'create_memo',
      'generate_report',
      'write_document',
      'draft_report',
      'document',
      'brief',
      'report',
    ],
    slugs: ['docx'],
  },
  // Excel / spreadsheet (expanded — catches finance / ops / sales xlsx intents)
  {
    keywords: [
      'create_spreadsheet',
      'create_model',
      'build_tracker',
      'generate_forecast',
      'create_budget',
      'build_pipeline',
      'financial_model',
      'financial_projection',
      'financial_projections',
      'fy_projection',
      'fy_projections',
      'sales_pipeline',
      'generate_spreadsheet',
      'balance_sheet',
      'income_statement',
      'cash_flow',
      'p&l',
      'profit_and_loss',
      'kpi_tracker',
      'spreadsheet',
      'tracker',
      'budget',
      'forecast',
      'projection',
      'projections',
      'workbook',
      'excel',
      'xlsx',
      // 'sheet' and 'template' are ambiguous when standalone, but the combo
      // tokens below hit the most common founder phrasings without matching
      // generic "report template" or "one-pager sheet":
      'excel sheet',
      'excel template',
      'sheet template',
      'spreadsheet template',
    ],
    slugs: ['xlsx'],
  },
  // PDF
  {
    keywords: [
      'create_pdf',
      'generate_pdf',
      'export_pdf',
      'extract_pdf',
      'summarize_pdf',
      'pdf_report',
    ],
    slugs: ['pdf'],
  },
]

// ─── Output-format param → skill slug mappings ────────────────────────────────

const FORMAT_PARAM_SKILL_MAP: Record<string, SkillSlug[]> = {
  pptx: ['pptx'],
  presentation: ['pptx'],
  pitch_deck: ['pptx', 'pitch_deck'],
  docx: ['docx'],
  document: ['docx'],
  xlsx: ['xlsx'],
  spreadsheet: ['xlsx'],
  pdf: ['pdf'],
}

// ─── Core loader ──────────────────────────────────────────────────────────────

/**
 * Resolves which skills apply to a given task and returns their combined
 * SKILL.md content for injection into the department prompt.
 *
 * Rules:
 * 1. Match task.action keywords against ACTION_SKILL_MAP (most-specific first).
 * 2. If task.params.output_format or task.params.type is set, also pull those skills.
 * 3. De-duplicate the resolved slug list.
 * 4. Read each SKILL.md from disk. Missing files are skipped with a warning.
 * 5. Concatenate content for multi-skill tasks (e.g. pitch_deck always includes pptx).
 *
 * @param taskAction   - The task.action string from the orchestrator plan.
 * @param deptSlug     - The department slug (used only for logging context).
 * @param params       - The task.params object; used to inspect output_format / type.
 * @returns            - Combined SKILL.md content and the list of resolved slugs.
 *
 * @throws Never — all errors are caught and logged; callers always get a result.
 */
export async function loadSkillsForTask(
  taskAction: string,
  deptSlug: string,
  params?: Record<string, unknown>
): Promise<{ content: string; slugs: SkillSlug[] }> {
  const resolvedSlugs = new Set<SkillSlug>()

  // Step 1: match action keywords — collect ALL matches (not first-wins) so a
  // multi-intent prompt like "write the FY28 report as an Excel sheet" loads
  // both docx and xlsx skills. `orderSlugs` controls final ordering; the
  // transformer detection layer picks the actual output format.
  const actionLower = taskAction.toLowerCase()
  for (const entry of ACTION_SKILL_MAP) {
    if (entry.keywords.some((kw) => actionLower.includes(kw))) {
      entry.slugs.forEach((s) => resolvedSlugs.add(s))
    }
  }

  // Step 2: match output_format / type params (additive — does not override action match)
  const outputFormat =
    (params?.output_format as string | undefined) ??
    (params?.type as string | undefined)

  if (outputFormat) {
    const formatLower = outputFormat.toLowerCase()
    const formatSlugs = FORMAT_PARAM_SKILL_MAP[formatLower]
    if (formatSlugs) {
      formatSlugs.forEach((s) => resolvedSlugs.add(s))
    }
  }

  // Refinement: Prevent docx from hijacking Engineering/Code tasks
  // If department is engineering, only load docx if it was explicitly in params.
  // This prevents generic "technical reports" or "briefs" from becoming Word docs.
  if (deptSlug === 'engineering' && resolvedSlugs.has('docx')) {
    const isExplicit = outputFormat && ['docx', 'document'].includes(outputFormat.toLowerCase())
    if (!isExplicit) {
      resolvedSlugs.delete('docx')
    }
  }

  // No skills matched — return empty result (no crash, no injection)
  if (resolvedSlugs.size === 0) {
    return { content: '', slugs: [] }
  }

  // Step 3: read SKILL.md files from disk in resolution order
  // pitch_deck always follows pptx so the LLM sees the base skill first
  const orderedSlugs = orderSlugs([...resolvedSlugs])
  const sections: string[] = []

  for (const slug of orderedSlugs) {
    const skillPath = path.join(SKILLS_DIR, slug, 'SKILL.md')
    try {
      const content = fs.readFileSync(skillPath, 'utf-8')
      sections.push(`### SKILL GUIDANCE: ${slug.toUpperCase()}\n\n${content}`)
    } catch (err) {
      // Missing SKILL.md is non-fatal — log and continue
      console.warn(
        `[Skills] SKILL.md not found for slug "${slug}" at ${skillPath}. Skipping. (dept: ${deptSlug}, action: ${taskAction})`
      )
    }
  }

  const content = sections.join('\n\n---\n\n')
  const loadedSlugs = orderedSlugs.filter((s) =>
    sections.some((sec) => sec.includes(s.toUpperCase()))
  )

  return { content, slugs: loadedSlugs }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensures skill slugs are ordered so base skills always precede meta-skills.
 * pptx must come before pitch_deck so the LLM reads the base contract first.
 */
function orderSlugs(slugs: SkillSlug[]): SkillSlug[] {
  const PRIORITY: SkillSlug[] = ['pptx', 'xlsx', 'docx', 'pdf', 'code', 'pitch_deck']
  return PRIORITY.filter((s) => slugs.includes(s))
}

/**
 * Returns a human-readable label for a skill slug.
 * Used in skills metadata logging.
 */
export function getSkillLabel(slug: SkillSlug): string {
  const labels: Record<SkillSlug, string> = {
    pptx: 'PowerPoint Presentation',
    docx: 'Word Document',
    xlsx: 'Excel Spreadsheet',
    pdf: 'PDF Document',
    code: 'Source Code',
    pitch_deck: 'Founder-Grade Pitch Deck',
  }
  return labels[slug] ?? slug
}
